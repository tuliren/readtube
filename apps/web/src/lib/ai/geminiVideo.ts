import {
  TRANSCRIPT_GENERATION_MEDIA_RESOLUTION,
  TRANSCRIPT_GENERATION_MODEL,
  TRANSCRIPT_GENERATION_NATIVE_ENDPOINT,
} from '@/constants';

/**
 * Thrown by the native Gemini video client. `retryable` tells the
 * workflow step whether re-running is worth it (transient 5xx / 429 /
 * network) or hopeless (auth, malformed request, missing key).
 */
export class GeminiVideoError extends Error {
  readonly status: number | null;
  readonly retryable: boolean;

  constructor(message: string, status: number | null, retryable: boolean) {
    super(message);
    this.name = 'GeminiVideoError';
    this.status = status;
    this.retryable = retryable;
    Object.setPrototypeOf(this, GeminiVideoError.prototype);
  }
}

export interface VideoWindowUsage {
  /** Total prompt input tokens (text + media). */
  inputTokens: number | null;
  /** Prompt tokens attributed to the VIDEO modality — 0 means the
   *  video was not ingested (the tell for a title-only hallucination). */
  videoTokens: number | null;
  outputTokens: number | null;
  /** Raw usageMetadata for the audit row. */
  raw: unknown;
}

export interface VideoWindowResult {
  text: string;
  /** Normalized to the AI SDK convention: 'length' when the output hit
   *  the token ceiling (native 'MAX_TOKENS'), otherwise 'stop'. */
  finishReason: string;
  /** Gemini's reason for refusing to answer this window on content-policy
   *  grounds (e.g. 'PROHIBITED_CONTENT'), or null when it answered. A
   *  block yields an empty {@link text}, so callers must check this first
   *  rather than treat the empty response as an unparseable transcript. */
  blockReason: string | null;
  usage: VideoWindowUsage;
}

interface UsageMetadata {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  promptTokensDetails?: Array<{ modality?: string; tokenCount?: number }>;
}

/**
 * Candidate `finishReason` values that mean Gemini stopped for a
 * content-policy reason rather than finishing normally. `PROHIBITED_CONTENT`
 * (the core, non-configurable filter that `safetySettings` cannot relax)
 * is the one seen on politically sensitive videos; the rest are covered
 * for completeness.
 */
const BLOCKING_FINISH_REASONS = new Set([
  'SAFETY',
  'RECITATION',
  'PROHIBITED_CONTENT',
  'BLOCKLIST',
  'SPII',
  'IMAGE_SAFETY',
]);

/**
 * Extract the content-policy block reason from a `generateContent`
 * response, or null when the model answered normally. Gemini signals a
 * block two ways: a prompt-level `promptFeedback.blockReason` (no
 * candidate is returned at all) or a candidate whose `finishReason` is
 * one of {@link BLOCKING_FINISH_REASONS}. Both surface here as a bare
 * string so the caller can log it and skip the window.
 */
export function extractBlockReason(data: {
  candidates?: Array<{ finishReason?: string }>;
  promptFeedback?: { blockReason?: string };
}): string | null {
  const promptBlock = data.promptFeedback?.blockReason;
  if (typeof promptBlock === 'string' && promptBlock.length > 0) {
    return promptBlock;
  }
  const finishReason = data.candidates?.[0]?.finishReason;
  if (typeof finishReason === 'string' && BLOCKING_FINISH_REASONS.has(finishReason)) {
    return finishReason;
  }
  return null;
}

function extractUsage(usageMetadata: UsageMetadata | undefined): VideoWindowUsage {
  if (usageMetadata == null) {
    return { inputTokens: null, videoTokens: null, outputTokens: null, raw: null };
  }
  const details = usageMetadata.promptTokensDetails ?? [];
  const videoTokens = details
    .filter((d) => (d.modality ?? '').toUpperCase() === 'VIDEO')
    .reduce((sum, d) => sum + (typeof d.tokenCount === 'number' ? d.tokenCount : 0), 0);
  return {
    inputTokens:
      typeof usageMetadata.promptTokenCount === 'number' ? usageMetadata.promptTokenCount : null,
    // Only report a video-token count when the modality breakdown is
    // present; absent details must not read as "0 video" (that would
    // wrongly trip the ingestion guard).
    videoTokens: details.length > 0 ? videoTokens : null,
    outputTokens:
      typeof usageMetadata.candidatesTokenCount === 'number'
        ? usageMetadata.candidatesTokenCount
        : null,
    raw: usageMetadata,
  };
}

/**
 * Transcribe / analyze one time-window of a YouTube video via the
 * native Gemini `generateContent` API, clipping to `[startOffsetSec,
 * endOffsetSec)` with a per-part `video_metadata` offset so the request
 * stays under Gemini's URL-ingestion length cap. Returns the raw model
 * text plus usage (including the VIDEO-modality token count, which the
 * caller uses to detect a non-ingestion).
 */
export async function generateFromVideoWindow(params: {
  prompt: string;
  videoUrl: string;
  startOffsetSec: number;
  endOffsetSec: number;
  maxOutputTokens: number;
  signal: AbortSignal;
}): Promise<VideoWindowResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (apiKey == null || apiKey.length === 0) {
    throw new GeminiVideoError('GEMINI_API_KEY is not configured.', null, false);
  }

  const body = {
    contents: [
      {
        parts: [
          { text: params.prompt },
          {
            file_data: { file_uri: params.videoUrl },
            video_metadata: {
              start_offset: `${Math.floor(params.startOffsetSec)}s`,
              end_offset: `${Math.ceil(params.endOffsetSec)}s`,
            },
          },
        ],
      },
    ],
    generationConfig: {
      mediaResolution: TRANSCRIPT_GENERATION_MEDIA_RESOLUTION,
      maxOutputTokens: params.maxOutputTokens,
    },
  };

  const url = `${TRANSCRIPT_GENERATION_NATIVE_ENDPOINT}/models/${TRANSCRIPT_GENERATION_MODEL}:generateContent`;

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'x-goog-api-key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: params.signal,
    });
  } catch (err) {
    // Network error / abort — transient, worth a retry.
    const message = err instanceof Error ? err.message : String(err);
    throw new GeminiVideoError(`Gemini request failed: ${message}`, null, true);
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    // 4xx (except 429) are our fault or the video's — retrying re-bills a
    // doomed call. 429 (rate limit) and 5xx are transient.
    const retryable = res.status === 429 || res.status >= 500;
    throw new GeminiVideoError(
      `Gemini API ${res.status}: ${detail.slice(0, 300)}`,
      res.status,
      retryable
    );
  }

  const data = (await res.json()) as {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> };
      finishReason?: string;
    }>;
    promptFeedback?: { blockReason?: string };
    usageMetadata?: UsageMetadata;
  };

  const candidate = data.candidates?.[0];
  const text = (candidate?.content?.parts ?? [])
    .map((part) => part.text)
    .filter((t): t is string => typeof t === 'string')
    .join('');
  const finishReason = candidate?.finishReason === 'MAX_TOKENS' ? 'length' : 'stop';

  return {
    text,
    finishReason,
    blockReason: extractBlockReason(data),
    usage: extractUsage(data.usageMetadata),
  };
}
