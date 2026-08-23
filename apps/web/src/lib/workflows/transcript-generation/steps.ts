import {
  TranscriptSource,
  UserRequestOutcome,
  VideoPlatformType,
  prisma,
} from '@readtube/database';
import { FatalError, getWorkflowMetadata } from 'workflow';

import {
  TRANSCRIPT_GENERATION_CHUNK_SECONDS,
  TRANSCRIPT_GENERATION_MAX_OUTPUT_TOKENS,
  TRANSCRIPT_GENERATION_MAX_PARALLEL_WINDOWS,
  TRANSCRIPT_GENERATION_MAX_VIDEO_SECONDS,
  TRANSCRIPT_GENERATION_TIMEOUT_MS,
} from '@/constants';
import {
  GeminiVideoError,
  type VideoWindowUsage,
  generateFromVideoWindow,
} from '@/lib/ai/geminiVideo';
import { detectLanguage } from '@/lib/language/detect';
import { getPlatformByType } from '@/lib/platforms';
import type { TranscriptSegment } from '@/lib/platforms/types';
import { persistTranscript } from '@/lib/transcripts/ensureTranscript';
import {
  TranscriptParseError,
  parseGeneratedTranscript,
} from '@/lib/transcripts/parseGeneratedTranscript';
import {
  type TranscriptWindow,
  normalizeWindowTimestamps,
  planTranscriptWindows,
  stitchWindowSegments,
} from '@/lib/transcripts/transcriptWindows';
import {
  TranscriptGenerationBlockedError,
  assertUsableGeneration,
} from '@/lib/transcripts/validateGeneratedTranscript';
import { completeUserRequest } from '@/lib/usage/userRequest';
import {
  releaseTranscriptGeneration,
  revertTranscriptGeneration,
} from '@/lib/workflows/runRegistry';
import { startAutoSummary } from '@/lib/workflows/summary/autoStart';
import { buildTranscriptGenerationPrompt } from '@/lib/workflows/transcript-generation/prompt';

export interface TranscriptGenerationInput {
  /** Video.id (DB cuid) of the video to transcribe. */
  videoDbId: string;
  /** Platform video id — YouTube-only today (the route guards this;
   *  Gemini can only ingest YouTube watch URLs). */
  videoSourceId: string;
  /** Video.duration_seconds, used to plan windows and clamp model
   *  timestamps. The route resolves an unknown duration (on-demand
   *  fetch + backfill) before starting, so this is always set for
   *  fresh runs; kept nullable for input-shape stability. */
  durationSeconds: number | null;
  /** Clerk user id of the requester, for the Transcript audit trail. */
  userId: string;
  /** UserRequest row inserted by the route (pending). The terminal
   *  steps backfill it with usage / FAILED. */
  userRequestId: string | null;
}

export interface GeneratedTranscript {
  segments: TranscriptSegment[];
  usage: unknown;
  finishReason: string;
}

/**
 * Before paying for an AI generation, re-probe the captions vendor.
 * The sticky `transcript_unavailable` flag may predate captions that
 * have since appeared (platform auto-captions lag upload by hours),
 * and a probe is instant and near-free compared to a generation.
 *
 * On a hit this persists the captions transcript, clears the sticky
 * flag, releases the generation claim, and completes the audit row —
 * the workflow then short-circuits without calling the model.
 *
 * Probe failures of any kind (permanent, transient, unexpected) fall
 * through to generation: the user explicitly asked for a transcript,
 * so a probe blip must not abort the run.
 */
export async function probeCaptionsStep(
  input: TranscriptGenerationInput
): Promise<{ found: boolean; transcriptId: string | null }> {
  'use step';

  let fetched;
  try {
    const platform = getPlatformByType(VideoPlatformType.YOUTUBE);
    fetched = await platform.fetchTranscript(input.videoSourceId);
  } catch (err) {
    console.info(
      `[transcriptGeneration] captions probe missed for video ${input.videoDbId}:`,
      err instanceof Error ? err.message : err
    );
    return { found: false, transcriptId: null };
  }

  const { workflowRunId } = getWorkflowMetadata();
  const created = await persistTranscript(prisma, {
    userId: input.userId,
    videoId: input.videoDbId,
    segments: fetched.segments,
    language: fetched.language,
    source: TranscriptSource.CAPTIONS,
    recordAudit: false,
  });
  // Captions genuinely exist now — undo the sticky flag so this video
  // behaves like any captioned video from here on.
  await prisma.video.update({
    where: { id: input.videoDbId },
    data: { transcript_unavailable: false },
  });
  await releaseTranscriptGeneration(prisma, input.videoDbId, workflowRunId);
  await safeCompleteUserRequest(input.userRequestId, {
    outcome: UserRequestOutcome.GENERATED,
    transcriptId: created.id,
  });
  console.info(
    `[transcriptGeneration] captions appeared for video ${input.videoDbId}; skipped AI generation`
  );
  return { found: true, transcriptId: created.id };
}

/**
 * The paid step: transcribe the video via the native Gemini API,
 * chunked so long videos actually ingest.
 *
 * Gemini caps YouTube-URL ingestion at ~1 h per request — a longer
 * video comes back with zero video tokens and the model hallucinates
 * from the title (see `TRANSCRIPT_GENERATION_MODEL` in constants). So we
 * split the video into {@link TRANSCRIPT_GENERATION_CHUNK_SECONDS}
 * windows, transcribe each with a `video_metadata` offset (windows use
 * absolute timestamps, so stitching is a plain concatenation), then
 * validate the stitched result.
 *
 * Parsing + validation live here, not in persist, on purpose: a
 * hallucinated/partial window throws a retryable error and the runtime
 * re-runs THIS step (fresh model calls) — the only way to recover.
 * Validating in persist would retry the same cached text forever.
 *
 * Errors retrying cannot fix — the video is inaccessible, or a window's
 * response can't be parsed — are FatalError so the runtime doesn't
 * re-bill a doomed call.
 */
export async function generateTranscriptStep(
  input: TranscriptGenerationInput
): Promise<GeneratedTranscript> {
  'use step';

  if (input.durationSeconds == null) {
    // The route resolves the duration before starting; windows can't
    // be planned without it, so a null here is a bug, not a retryable
    // condition.
    throw new FatalError('Video duration is required for AI transcript generation.');
  }
  // Videos longer than the cap are transcribed only up to it: windows,
  // stitching, and the coverage guard all use the capped length as the
  // effective duration (validating against the full length would
  // reject a correctly capped run as incomplete). The reader flags the
  // untranscribed tail — the transcript GET computes gaps against the
  // FULL video duration, so the tail surfaces as a trailing gap.
  const transcribeSeconds = Math.min(
    input.durationSeconds,
    TRANSCRIPT_GENERATION_MAX_VIDEO_SECONDS
  );
  if (transcribeSeconds < input.durationSeconds) {
    console.info(
      `[transcriptGeneration] video ${input.videoDbId} runs ${input.durationSeconds}s; ` +
        `transcribing only the first ${transcribeSeconds}s`
    );
  }
  const videoUrl = `https://www.youtube.com/watch?v=${input.videoSourceId}`;
  const windows = planTranscriptWindows(transcribeSeconds, TRANSCRIPT_GENERATION_CHUNK_SECONDS);

  const results = await mapWithConcurrency(
    windows,
    TRANSCRIPT_GENERATION_MAX_PARALLEL_WINDOWS,
    (window) => transcribeWindow(input, videoUrl, window)
  );

  const stitched = stitchWindowSegments(
    results.map((r) => r.segments),
    transcribeSeconds
  );

  const totalInputTokens = results.reduce((sum, r) => sum + (r.usage.inputTokens ?? 0), 0);
  // If any window hit the output-token ceiling its coverage is partial;
  // flag it so the coverage guard salvages rather than rejects.
  const finishReason = results.some((r) => r.finishReason === 'length') ? 'length' : 'stop';
  const blockedWindowCount = results.filter((r) => r.blocked).length;
  if (blockedWindowCount > 0) {
    // Content-policy blocks are deterministic and non-configurable, so we
    // keep the windows that came through rather than fail the whole run.
    console.warn(
      `[transcriptGeneration] ${blockedWindowCount}/${windows.length} window(s) blocked by ` +
        `content policy for video ${input.videoDbId}; stitching the surviving windows`
    );
  }

  try {
    assertUsableGeneration({
      segments: stitched,
      durationSeconds: transcribeSeconds,
      finishReason,
      inputTokens: totalInputTokens > 0 ? totalInputTokens : null,
      blockedWindowCount,
    });
  } catch (err) {
    const coveredMs = stitched.reduce((max, segment) => Math.max(max, segment.endMs), 0);
    console.warn(
      `[transcriptGeneration] rejecting unusable output for video ${input.videoDbId}: ` +
        `windows=${windows.length}, blocked=${blockedWindowCount}, inputTokens=${totalInputTokens}, ` +
        `segments=${stitched.length}, coveredMs=${coveredMs}, durationMs=${transcribeSeconds * 1000}, ` +
        `finishReason=${finishReason}`
    );
    // A block-caused shortfall re-blocks on retry — make it terminal so
    // the runtime does not re-bill a doomed rerun.
    if (err instanceof TranscriptGenerationBlockedError) {
      throw new FatalError(err.message);
    }
    throw err;
  }

  return {
    segments: stitched,
    usage: aggregateWindowUsage(results),
    finishReason,
  };
}

interface WindowResult {
  segments: TranscriptSegment[];
  usage: VideoWindowUsage;
  finishReason: string;
  /** True when Gemini refused this window on content-policy grounds. Its
   *  segments are empty; the caller stitches the surviving windows and
   *  fails only if too little of the video remains. */
  blocked: boolean;
}

/** Transcribe one window: native call, content-block skip, ingestion
 *  guard, parse, and normalize timestamps to absolute time. */
async function transcribeWindow(
  input: TranscriptGenerationInput,
  videoUrl: string,
  window: TranscriptWindow
): Promise<WindowResult> {
  let result;
  try {
    result = await generateFromVideoWindow({
      prompt: buildTranscriptGenerationPrompt(),
      videoUrl,
      startOffsetSec: window.startSec,
      endOffsetSec: window.endSec,
      maxOutputTokens: TRANSCRIPT_GENERATION_MAX_OUTPUT_TOKENS,
      // Total-duration abort is the stall guard; sized to stay under the
      // workflow step budget even with windows running in parallel.
      signal: AbortSignal.timeout(TRANSCRIPT_GENERATION_TIMEOUT_MS),
    });
  } catch (err) {
    throw classifyGenerationError(err);
  }

  // Content-policy block: Gemini returns an empty response with a
  // blockReason (e.g. PROHIBITED_CONTENT on politically sensitive
  // videos). This is deterministic and non-configurable — retrying and
  // safetySettings do not help — so drop this window and let the caller
  // stitch the rest rather than fail the whole video.
  if (result.blockReason != null) {
    console.warn(
      `[transcriptGeneration] Gemini blocked the ${formatWindow(window)} segment ` +
        `(${result.blockReason}) for video ${input.videoDbId}; skipping it`
    );
    return { segments: [], usage: result.usage, finishReason: 'blocked', blocked: true };
  }

  // Ingestion guard: zero VIDEO tokens means Gemini didn't watch this
  // window (length cap or fetch miss) and is hallucinating. Retryable —
  // a fresh call usually ingests.
  if (result.usage.videoTokens != null && result.usage.videoTokens <= 0) {
    throw new Error(
      `The model did not read the ${formatWindow(window)} segment of the video. Please try again.`
    );
  }

  let segments;
  try {
    // No duration clamp here — normalizeWindowTimestamps inspects the
    // raw offsets first, then stitchWindowSegments clamps to the video.
    segments = parseGeneratedTranscript(result.text, { durationMs: null });
  } catch (err) {
    if (err instanceof TranscriptParseError) {
      throw new FatalError(`The model returned an unusable transcript: ${err.message}`);
    }
    throw err;
  }

  return {
    segments: normalizeWindowTimestamps(segments, window),
    usage: result.usage,
    finishReason: result.finishReason,
    blocked: false,
  };
}

/** Run `fn` over `items` in ordered batches of at most `limit`,
 *  preserving input order and rejecting on the first error. */
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  for (let i = 0; i < items.length; i += limit) {
    const batch = items.slice(i, i + limit);
    const settled = await Promise.all(batch.map((item) => fn(item)));
    for (let j = 0; j < settled.length; j++) {
      results[i + j] = settled[j];
    }
  }
  return results;
}

function aggregateWindowUsage(results: WindowResult[]): unknown {
  const totals = { inputTokens: 0, outputTokens: 0, videoTokens: 0, windows: results.length };
  for (const r of results) {
    totals.inputTokens += r.usage.inputTokens ?? 0;
    totals.outputTokens += r.usage.outputTokens ?? 0;
    totals.videoTokens += r.usage.videoTokens ?? 0;
  }
  return totals;
}

function formatWindow(window: TranscriptWindow): string {
  return `${Math.floor(window.startSec / 60)}–${Math.ceil(window.endSec / 60)} min`;
}

/**
 * Persist the validated segments, release the claim, and backfill the
 * audit row. Parsing and quality validation already ran in the generate
 * step (see {@link generateTranscriptStep}), so this step is pure I/O.
 */
export async function persistGeneratedTranscriptStep(
  input: TranscriptGenerationInput & GeneratedTranscript
): Promise<{ transcriptId: string }> {
  'use step';

  if (input.finishReason === 'length') {
    console.warn(
      `[transcriptGeneration] output hit the token ceiling for video ${input.videoDbId}; ` +
        'persisting the salvaged prefix'
    );
  }

  const { segments } = input;
  const joined = segments.map((segment) => segment.text).join(' ');
  const language = detectLanguage(joined) ?? 'unknown';

  const { workflowRunId } = getWorkflowMetadata();
  const created = await persistTranscript(prisma, {
    userId: input.userId,
    videoId: input.videoDbId,
    segments,
    language,
    source: TranscriptSource.GENERATED,
    recordAudit: false,
  });
  await releaseTranscriptGeneration(prisma, input.videoDbId, workflowRunId);
  await safeCompleteUserRequest(input.userRequestId, {
    outcome: UserRequestOutcome.GENERATED,
    usage: input.usage,
    transcriptId: created.id,
  });
  return { transcriptId: created.id };
}

/**
 * Follow-up step: kick off a full summary generation for the fresh
 * transcript so the user who asked for a transcript comes back to a
 * summary. Runs as an independent child workflow via start() (the
 * WDK-sanctioned background pattern) — the reader's summary tab taps
 * into it through the normal findActiveSummaryRun registry. Failures
 * are swallowed: the transcript is already persisted, and a missed
 * auto-summary just leaves the user the regular Generate button.
 */
export async function startSummaryGenerationStep(
  input: TranscriptGenerationInput,
  transcriptId: string
): Promise<void> {
  'use step';

  try {
    await startAutoSummary(prisma, {
      userId: input.userId,
      videoDbId: input.videoDbId,
      transcriptId,
    });
  } catch (err) {
    console.error(
      `[transcriptGeneration] auto-summary start failed for video ${input.videoDbId}:`,
      err
    );
  }
}

/**
 * Failure-path step: revert the Video row's GENERATING marker with a
 * user-facing message (shown by the reader's generation panel) and
 * flip the audit row to FAILED. Both writes are best-effort — an
 * audit hiccup must not mask the real error.
 */
export async function failTranscriptGenerationStep(
  input: TranscriptGenerationInput,
  errorMessage: string
): Promise<void> {
  'use step';

  const { workflowRunId } = getWorkflowMetadata();
  const message = truncateForDisplay(errorMessage);
  try {
    await revertTranscriptGeneration(prisma, input.videoDbId, workflowRunId, message);
  } catch (err) {
    console.error('[transcriptGeneration] failed to revert generation marker:', err);
  }
  await safeCompleteUserRequest(input.userRequestId, {
    outcome: UserRequestOutcome.FAILED,
    errorMessage: message,
  });
}

/**
 * Decide whether a model-call failure is worth retrying. Access
 * problems (private / removed / unsupported video) and other
 * non-retryable rejections come back as {@link GeminiVideoError} with
 * `retryable=false` — retrying re-bills a doomed call, so map them to
 * FatalError with a friendly message. Timeouts and network/5xx/429
 * blips stay plain Errors so the workflow runtime's step retry gets
 * another shot.
 */
function classifyGenerationError(err: unknown): Error {
  if (err instanceof Error && err.name === 'TimeoutError') {
    return new Error('Transcript generation timed out. Please try again.');
  }
  if (err instanceof GeminiVideoError) {
    if (err.retryable) {
      return err;
    }
    const inaccessible =
      /not found|not accessible|not available|private|age.restricted|unsupported|cannot process|invalid.argument|failed.precondition|permission/i.test(
        err.message
      );
    if (inaccessible) {
      return new FatalError(
        'The model could not access this video. It may be private, age-restricted, or removed.'
      );
    }
    return new FatalError(truncateForDisplay(`Transcript generation failed: ${err.message}`));
  }
  if (err instanceof Error) {
    return err;
  }
  return new Error('Transcript generation failed.');
}

/** Keep stored/displayed failure messages bounded — raw gateway
 *  errors can embed whole response bodies. */
function truncateForDisplay(message: string): string {
  const limit = 300;
  if (message.length <= limit) {
    return message;
  }
  return `${message.slice(0, limit - 1)}…`;
}

async function safeCompleteUserRequest(
  userRequestId: string | null,
  params: Parameters<typeof completeUserRequest>[2]
): Promise<void> {
  if (userRequestId == null) {
    return;
  }
  try {
    await completeUserRequest(prisma, userRequestId, params);
  } catch (err) {
    console.error('[transcriptGeneration] failed to complete UserRequest:', err);
  }
}
