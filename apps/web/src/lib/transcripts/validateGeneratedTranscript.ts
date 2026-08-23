import {
  TRANSCRIPT_GENERATION_MIN_COVERAGE_RATIO,
  TRANSCRIPT_GENERATION_MIN_INPUT_TOKENS,
} from '@/constants';
import type { TranscriptSegment } from '@/lib/platforms/types';

/**
 * Thrown when a generation succeeded at the API level but produced an
 * unusable transcript: the model never ingested the video (near-zero
 * input tokens) or covered only a sliver of a video whose duration we
 * know. Deliberately NOT a FatalError — the failure is an intermittent
 * server-side video-fetch miss, not a deterministic one, so the
 * workflow's default step retry should get another shot at a real
 * transcription. The message is user-facing: after retries are
 * exhausted it becomes the reader panel's failure text.
 */
export class TranscriptGenerationQualityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TranscriptGenerationQualityError';
    // Required for `instanceof` to survive the es5 `extends Error`
    // transpile — same fix as TranscriptParseError.
    Object.setPrototypeOf(this, TranscriptGenerationQualityError.prototype);
  }
}

/**
 * Thrown when Gemini's content-policy filter blocked so many windows
 * that too little of the video remains to persist. Unlike
 * {@link TranscriptGenerationQualityError}, this shortfall is
 * DETERMINISTIC — a block re-blocks on retry — so the caller maps it to
 * a FatalError rather than letting the runtime re-bill a doomed rerun.
 */
export class TranscriptGenerationBlockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TranscriptGenerationBlockedError';
    Object.setPrototypeOf(this, TranscriptGenerationBlockedError.prototype);
  }
}

export interface GenerationQualityInput {
  /** Parsed segments, already clamped to the video duration. */
  segments: TranscriptSegment[];
  /** Video.duration_seconds; null skips the coverage check. */
  durationSeconds: number | null;
  /** The model call's finishReason ('stop' | 'length' | ...). */
  finishReason: string;
  /** Prompt input tokens from usage; null skips the ingestion check. */
  inputTokens: number | null;
  /** How many windows Gemini refused on content-policy grounds. When a
   *  coverage shortfall coincides with a block, the gap is deterministic,
   *  so it is reported via the fatal {@link TranscriptGenerationBlockedError}
   *  instead of the retryable quality error. Defaults to 0. */
  blockedWindowCount?: number;
}

/**
 * Guard a fresh generation before it is persisted. Throws
 * {@link TranscriptGenerationQualityError} when the output betrays that
 * Gemini did not actually transcribe the video, so the caller (a
 * workflow step) can let the runtime retry the model call rather than
 * store a hallucinated or partial transcript.
 */
export function assertUsableGeneration(input: GenerationQualityInput): void {
  // Ingestion guard: Gemini intermittently fails to fetch the YouTube
  // video server-side and answers from the text prompt alone, inventing
  // a generic transcript unrelated to the actual video. Such a response
  // carries only the prompt tokens as input (no VIDEO/AUDIO modality),
  // so a near-zero count is a definitive "media never ingested" signal.
  if (input.inputTokens != null && input.inputTokens < TRANSCRIPT_GENERATION_MIN_INPUT_TOKENS) {
    throw new TranscriptGenerationQualityError(
      'The model could not read the video and returned an unrelated transcript. Please try again.'
    );
  }

  // Coverage guard: even with media ingested, a run can stop far short
  // of the end. If the transcript ends well before a video whose
  // duration we know — and was not cut off by the output-token ceiling
  // (finishReason 'length', already salvaged) — treat it as incomplete.
  // A shortfall from content-policy blocks (blockedWindowCount > 0) is
  // deterministic, so it is fatal; any other shortfall is an intermittent
  // miss worth a retry. Coverage at or above the ratio passes even when
  // some windows were blocked — the surviving windows are persisted as a
  // partial transcript with a gap where the block was.
  if (input.durationSeconds != null && input.finishReason !== 'length') {
    const coveredMs = input.segments.reduce((max, segment) => Math.max(max, segment.endMs), 0);
    const durationMs = input.durationSeconds * 1000;
    if (coveredMs < durationMs * TRANSCRIPT_GENERATION_MIN_COVERAGE_RATIO) {
      if ((input.blockedWindowCount ?? 0) > 0) {
        throw new TranscriptGenerationBlockedError(
          'The model was blocked by content policy on too much of this video to produce a usable transcript.'
        );
      }
      throw new TranscriptGenerationQualityError(
        'The generated transcript covered only part of the video. Please try again.'
      );
    }
  }
}
