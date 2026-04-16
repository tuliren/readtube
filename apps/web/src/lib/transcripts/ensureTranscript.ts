import type { PrismaClient } from '@readtube/database';

import { SubtitleFetchError, fetchSubtitleViaTranscriptApi } from '@/lib/subtitles';
import type { TranscriptSegment } from '@/lib/subtitles/types';

interface CachedTranscript {
  id: string;
  segments: TranscriptSegment[];
}

export type EnsureTranscriptResult =
  | { ok: true; transcript: CachedTranscript }
  // Caller maps each reason to a different HTTP response so the
  // client can react correctly:
  //   - 'not-found'      → 404 (the user doesn't own this video)
  //   - 'unavailable'    → 410 Gone (sticky: video has no captions)
  //   - 'transient-error' → 503 (network / 429 / 5xx; safe to retry)
  // The transient case must NOT be conflated with unavailable on the
  // client — broadcasting transcriptStatus='unavailable' for a
  // transient blip would lock the entire reader for the session.
  | { ok: false; reason: 'unavailable' | 'transient-error' | 'not-found' };

/**
 * Make sure a transcript exists for the given video, fetching it from
 * upstream on the fly if needed. The single source of truth that the
 * transcript route, the summary route, and the article route all call
 * into so they share the same caching + retry behavior.
 *
 * Logic:
 *   1. IDOR check (the user must be subscribed to the channel that
 *      owns the video — same predicate as the GET /transcript route).
 *   2. If a Transcript row already exists for the video, return it.
 *   3. Otherwise, if Video.transcript_unavailable is already true,
 *      return { ok: false, reason: 'unavailable' } without touching
 *      the upstream API. This is the "remember failed fetches" half
 *      of the contract — once we've tried and come back empty, we
 *      stop retrying so the upstream provider isn't hammered every
 *      time the user opens a captionless video.
 *   4. Otherwise call fetchSubtitleViaTranscriptApi. On success,
 *      persist a Transcript row and return it. On failure, set
 *      Video.transcript_unavailable = true (sticky), and return
 *      { ok: false, reason: 'unavailable' }.
 *
 * Returns reason: 'not-found' only when the IDOR check fails (the
 * caller maps that to a 404 response).
 */
export async function ensureTranscript(
  prisma: PrismaClient,
  userId: string,
  videoDbId: string
): Promise<EnsureTranscriptResult> {
  const video = await prisma.video.findFirst({
    where: {
      id: videoDbId,
      OR: [
        { channel: { subscriptions: { some: { user_id: userId } } } },
        { standalone: { some: { user_id: userId } } },
      ],
    },
    select: {
      id: true,
      source_id: true,
      transcript_unavailable: true,
      transcripts: {
        orderBy: { created_at: 'desc' },
        take: 1,
        select: { id: true, text: true },
      },
    },
  });
  if (video == null) {
    return { ok: false, reason: 'not-found' };
  }

  // Cache hit — newest Transcript row wins.
  const cached = video.transcripts[0];
  if (cached != null) {
    return {
      ok: true,
      transcript: {
        id: cached.id,
        segments: JSON.parse(cached.text) as TranscriptSegment[],
      },
    };
  }

  // No cached transcript and the sticky "we already tried" flag is
  // set — don't retry.
  if (video.transcript_unavailable) {
    return { ok: false, reason: 'unavailable' };
  }

  // First attempt — try to fetch.
  let fetched;
  try {
    fetched = await fetchSubtitleViaTranscriptApi(video.source_id);
  } catch (err) {
    console.error('[ensureTranscript] upstream fetch failed:', err);
    // Categorize the failure so the caller can map it to the right
    // HTTP response and the client can react accordingly.
    //
    // Permanent (this video has no captions): flip the sticky
    // transcript_unavailable flag so subsequent calls short-circuit,
    // and return reason='unavailable'. The caller maps this to 410.
    //
    // Transient (network blip, 429, 5xx, missing API key): leave
    // the sticky flag alone so the next attempt — possibly seconds
    // later — gets a fresh shot, and return reason='transient-error'.
    // The caller maps this to 503. Without this distinction the
    // client previously saw the same 410 on a transient blip and
    // broadcast transcriptStatus='unavailable', locking the entire
    // reader (Summary / Article / Transcript tabs all hidden) for
    // the rest of the session.
    const transient = err instanceof SubtitleFetchError ? err.transient : true;
    if (transient) {
      return { ok: false, reason: 'transient-error' };
    }
    await prisma.video.update({
      where: { id: video.id },
      data: { transcript_unavailable: true },
    });
    return { ok: false, reason: 'unavailable' };
  }

  // Success — persist and hand back the cached id so callers like
  // the summary route can attach generated rows to it.
  const created = await prisma.transcript.create({
    data: {
      video_id: video.id,
      text: JSON.stringify(fetched.segments),
      language: fetched.language,
      fetched_at: new Date(),
    },
    select: { id: true },
  });
  return {
    ok: true,
    transcript: { id: created.id, segments: fetched.segments },
  };
}
