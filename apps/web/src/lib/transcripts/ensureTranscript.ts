import type { PrismaClient } from '@readtube/database';

import { fetchSubtitleViaTranscriptApi } from '@/lib/subtitles';
import type { TranscriptSegment } from '@/lib/subtitles/types';

interface CachedTranscript {
  id: string;
  segments: TranscriptSegment[];
}

export type EnsureTranscriptResult =
  | { ok: true; transcript: CachedTranscript }
  | { ok: false; reason: 'unavailable' | 'not-found' };

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
    where: { id: videoDbId, channel: { subscriptions: { some: { user_id: userId } } } },
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
    // Mark sticky-unavailable so subsequent calls short-circuit. We
    // treat any upstream error (network blip, 429, captions truly
    // missing) the same way for now — the user can manually clear
    // the flag in the DB if a captionless video later gains captions.
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
