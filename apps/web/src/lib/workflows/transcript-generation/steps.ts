import {
  TranscriptSource,
  UserRequestOutcome,
  VideoPlatformType,
  prisma,
} from '@readtube/database';
import { APICallError, generateText } from 'ai';
import { FatalError, getWorkflowMetadata } from 'workflow';

import {
  TRANSCRIPT_GENERATION_MAX_OUTPUT_TOKENS,
  TRANSCRIPT_GENERATION_MODEL,
  TRANSCRIPT_GENERATION_TIMEOUT_MS,
} from '@/constants';
import { detectLanguage } from '@/lib/language/detect';
import { getPlatformByType } from '@/lib/platforms';
import type { TranscriptSegment } from '@/lib/platforms/types';
import { persistTranscript } from '@/lib/transcripts/ensureTranscript';
import {
  TranscriptParseError,
  parseGeneratedTranscript,
} from '@/lib/transcripts/parseGeneratedTranscript';
import { assertUsableGeneration } from '@/lib/transcripts/validateGeneratedTranscript';
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
  /** Video.duration_seconds, used to clamp model timestamps. The
   *  route rejects videos with unknown duration, so this is always
   *  set for fresh runs; kept nullable for input-shape stability. */
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
 * The paid step: hand Gemini the YouTube watch URL as a file part
 * (the AI Gateway forwards it; Gemini ingests the video server-side),
 * parse the segment JSON, and validate that the model actually
 * transcribed the video before returning.
 *
 * Parsing and quality validation live here, not in the persist step, on
 * purpose: when the model returns a hallucinated or partial transcript
 * (Gemini intermittently fails to fetch the video and answers from the
 * prompt text alone), {@link assertUsableGeneration} throws a retryable
 * error and the workflow runtime re-runs THIS step — a fresh model
 * call, the only way to recover. Validating in persist would retry the
 * same cached text forever and never re-ingest the video.
 *
 * Errors that retrying cannot fix — the model can't access the video at
 * all, or the response can't be parsed into any segments — are
 * classified as FatalError so the runtime doesn't re-bill a doomed call.
 */
export async function generateTranscriptStep(
  input: TranscriptGenerationInput
): Promise<GeneratedTranscript> {
  'use step';

  let result;
  try {
    result = await generateText({
      model: TRANSCRIPT_GENERATION_MODEL,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: buildTranscriptGenerationPrompt() },
            {
              type: 'file',
              data: new URL(`https://www.youtube.com/watch?v=${input.videoSourceId}`),
              mediaType: 'video/mp4',
            },
          ],
        },
      ],
      providerOptions: {
        // Transcription only needs the audio track, but there is no
        // gateway knob to drop video frames yet — low resolution at
        // least minimizes the per-frame token cost.
        google: { mediaResolution: 'MEDIA_RESOLUTION_LOW' },
      },
      maxOutputTokens: TRANSCRIPT_GENERATION_MAX_OUTPUT_TOKENS,
      // generateText has no incremental output to watchdog (unlike the
      // summary/article streams), so a total-duration abort is the
      // stall guard. Sized to stay under the workflow step budget.
      abortSignal: AbortSignal.timeout(TRANSCRIPT_GENERATION_TIMEOUT_MS),
    });
  } catch (err) {
    throw classifyGenerationError(err);
  }

  const durationMs = input.durationSeconds == null ? null : input.durationSeconds * 1000;
  let segments;
  try {
    segments = parseGeneratedTranscript(result.text, { durationMs });
  } catch (err) {
    if (err instanceof TranscriptParseError) {
      throw new FatalError(`The model returned an unusable transcript: ${err.message}`);
    }
    throw err;
  }

  // Retryable: an intermittent ingestion miss produces a hallucinated
  // or partial transcript that a fresh call usually fixes.
  const inputTokens = extractInputTokens(result.usage);
  try {
    assertUsableGeneration({
      segments,
      durationSeconds: input.durationSeconds,
      finishReason: result.finishReason,
      inputTokens,
    });
  } catch (err) {
    const coveredMs = segments.reduce((max, segment) => Math.max(max, segment.endMs), 0);
    console.warn(
      `[transcriptGeneration] rejecting unusable output for video ${input.videoDbId}: ` +
        `inputTokens=${inputTokens ?? 'unknown'}, segments=${segments.length}, ` +
        `coveredMs=${coveredMs}, durationMs=${durationMs ?? 'unknown'}, ` +
        `finishReason=${result.finishReason}`
    );
    throw err;
  }

  return {
    segments,
    usage: serializableUsage(result.usage),
    finishReason: result.finishReason,
  };
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
 * non-retryable API rejections come back as 4xx responses — retrying
 * re-bills a doomed call, so map them to FatalError with a friendly
 * message. Timeouts and network/5xx/429 blips stay plain Errors so
 * the workflow runtime's step retry gets another shot.
 */
function classifyGenerationError(err: unknown): Error {
  if (err instanceof Error && err.name === 'TimeoutError') {
    return new Error('Transcript generation timed out. Please try again.');
  }
  if (APICallError.isInstance(err)) {
    const retryable = err.isRetryable || err.statusCode == null || err.statusCode >= 500;
    if (!retryable) {
      const detail = `${err.message} ${String(err.responseBody ?? '')}`;
      const inaccessible =
        /not found|not accessible|not available|private|age.restricted|unsupported|cannot process|invalid.argument|failed.precondition/i.test(
          detail
        );
      if (inaccessible) {
        return new FatalError(
          'The model could not access this video. It may be private, age-restricted, or removed.'
        );
      }
      return new FatalError(truncateForDisplay(`Transcript generation failed: ${err.message}`));
    }
  }
  if (err instanceof Error) {
    return err;
  }
  return new Error('Transcript generation failed.');
}

/** Pull the normalized prompt-input token count off the AI SDK usage
 *  object. Returns null when absent so the ingestion guard fails open
 *  (a missing count must not reject an otherwise-valid transcript). */
function extractInputTokens(usage: unknown): number | null {
  if (usage != null && typeof usage === 'object' && 'inputTokens' in usage) {
    const value = (usage as { inputTokens?: unknown }).inputTokens;
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
  }
  return null;
}

/** Workflow step results must be serializable; usage objects from the
 *  AI SDK are plain data but may carry undefined fields — round-trip
 *  through JSON to normalize. */
function serializableUsage(usage: unknown): unknown {
  if (usage == null) {
    return null;
  }
  try {
    return JSON.parse(JSON.stringify(usage)) as unknown;
  } catch {
    return null;
  }
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
