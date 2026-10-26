import { buildScheduledMessage, parseScheduledResponse } from './scheduledVideoToast';

/**
 * Outcome of making sure a transcript exists before a Summary /
 * Article generation, as the reader needs to react to it:
 *
 *   ready        transcript is cached; go ahead
 *   no-captions  the platform has no captions (410); offer AI
 *                transcription instead of failing
 *   scheduled    premiere that hasn't aired (425); toast and reset
 *   error        anything else, including transient upstream blips
 *                (503), shown in the tab with a retry
 */
export type TranscriptOutcome =
  | { kind: 'ready' }
  | { kind: 'no-captions' }
  | { kind: 'scheduled'; message: string }
  | { kind: 'error'; message: string };

const TRANSIENT_MESSAGE = 'Could not fetch the transcript right now. Please try again.';

/**
 * Map a non-OK response from a route that runs `ensureTranscript`
 * (POST /transcript, POST /summary, POST /article) to a transcript
 * outcome. Returns null when the status isn't transcript-related, so
 * the caller falls back to its own generic error handling.
 */
export async function transcriptOutcomeFromResponse(
  res: Response
): Promise<TranscriptOutcome | null> {
  if (res.status === 410) {
    return { kind: 'no-captions' };
  }
  if (res.status === 425) {
    const body = await parseScheduledResponse(res);
    return { kind: 'scheduled', message: buildScheduledMessage(body?.scheduledStartTime ?? null) };
  }
  if (res.status === 503) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    return { kind: 'error', message: body?.error ?? TRANSIENT_MESSAGE };
  }
  return null;
}

/**
 * Fetch (or confirm) the video's transcript ahead of a generate POST,
 * so the reader can show "Fetching the transcript" as its own step
 * instead of folding the upstream caption lookup into one long wait.
 */
export async function prepareTranscript(videoDbId: string): Promise<TranscriptOutcome> {
  let res: Response;
  try {
    res = await fetch(`/api/videos/${videoDbId}/transcript`, { method: 'POST' });
  } catch {
    return { kind: 'error', message: TRANSIENT_MESSAGE };
  }
  if (res.ok) {
    return { kind: 'ready' };
  }
  const outcome = await transcriptOutcomeFromResponse(res);
  if (outcome != null) {
    return outcome;
  }
  const body = (await res.json().catch(() => null)) as { error?: string } | null;
  return { kind: 'error', message: body?.error ?? 'Could not fetch the transcript.' };
}
