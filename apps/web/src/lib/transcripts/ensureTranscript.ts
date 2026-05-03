import { type PrismaClient, UserRequestOutcome } from '@readtube/database';

import { getPlatformByType } from '@/lib/platforms';
import { SubtitleFetchError, type TranscriptSegment } from '@/lib/platforms/types';
import { recordTranscriptRequest } from '@/lib/usage/userRequest';

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
 *
 * Audit trail: only branches that bear real upstream cost write a
 * TRANSCRIPT row to `UserRequest` — GENERATED (paid call, got
 * transcript), UNAVAILABLE (paid call, came back empty + flipped the
 * sticky flag), and TRANSIENT_ERROR (paid call, blipped). Zero-cost
 * paths — cache hit and sticky-unavailable short-circuit — skip the
 * write. IDOR misses also skip: there's no video FK target to attach
 * to and we don't want to leak signal.
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
        { playlist_items: { some: { playlist: { user_id: userId } } } },
      ],
    },
    select: {
      id: true,
      source_id: true,
      source_type: true,
      transcript_unavailable: true,
      transcripts: {
        orderBy: { created_at: 'desc' },
        take: 1,
        select: { id: true, text: true },
      },
    },
  });
  if (video == null) {
    // No videoId we can attribute against here without leaking IDOR
    // signal. Skip the audit row entirely on NOT_FOUND — the FK on
    // user_id would be valid, but `video_id` requires a row that
    // exists, and we don't want to fabricate one.
    return { ok: false, reason: 'not-found' };
  }

  // Cache hit — newest Transcript row wins. We deliberately don't
  // record a UserRequest here: a cached transcript fetch costs nothing
  // and the "user accessed this transcript" signal is already implicit
  // in the SUMMARY/ARTICLE row that triggered the auto-fetch (every
  // Generate click ensures the transcript first). Recording would just
  // double-count and add noise to per-user dashboards.
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
  // set — don't retry. Zero-cost short-circuit, so no audit row.
  if (video.transcript_unavailable) {
    return { ok: false, reason: 'unavailable' };
  }

  // First attempt — try to fetch via the video's platform.
  let fetched;
  try {
    const platform = getPlatformByType(video.source_type);
    fetched = await platform.fetchTranscript(video.source_id);
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
      await safeRecord(prisma, {
        userId,
        videoId: video.id,
        outcome: UserRequestOutcome.TRANSIENT_ERROR,
        errorMessage: err instanceof Error ? err.message : String(err),
      });
      return { ok: false, reason: 'transient-error' };
    }
    await prisma.video.update({
      where: { id: video.id },
      data: { transcript_unavailable: true },
    });
    await safeRecord(prisma, {
      userId,
      videoId: video.id,
      outcome: UserRequestOutcome.UNAVAILABLE,
      errorMessage: err instanceof Error ? err.message : String(err),
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
  await safeRecord(prisma, {
    userId,
    videoId: video.id,
    outcome: UserRequestOutcome.GENERATED,
    transcriptId: created.id,
  });
  return {
    ok: true,
    transcript: { id: created.id, segments: fetched.segments },
  };
}

// Audit-log writes must never break the caller — a stale FK or DB
// hiccup on an analytics row shouldn't bubble back into the user's
// 200/404/410 response. Log and swallow.
async function safeRecord(
  prisma: PrismaClient,
  params: Parameters<typeof recordTranscriptRequest>[1]
): Promise<void> {
  try {
    await recordTranscriptRequest(prisma, params);
  } catch (err) {
    console.error('[ensureTranscript] failed to record UserRequest:', err);
  }
}
