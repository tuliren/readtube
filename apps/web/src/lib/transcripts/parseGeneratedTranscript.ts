import type { TranscriptSegment } from '@/lib/platforms/types';

/**
 * Thrown when a model response cannot be turned into any usable
 * transcript segments. Deterministic for a given response — callers
 * should treat it as fatal rather than retry the same output.
 */
export class TranscriptParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TranscriptParseError';
    // Required for `instanceof TranscriptParseError` to work after TS
    // transpiles `extends Error` for an es5 target — same fix as
    // SubtitleFetchError in lib/platforms/types.ts.
    Object.setPrototypeOf(this, TranscriptParseError.prototype);
  }
}

interface RawSegment {
  start?: unknown;
  end?: unknown;
  text?: unknown;
}

/**
 * Parse a model-generated transcript response into the platform-
 * neutral `TranscriptSegment` shape stored on `Transcript.text`.
 *
 * The prompt asks for a bare JSON array of
 * `{"start": "MM:SS", "end": "MM:SS", "text": "..."}` but models
 * drift, so this parses defensively:
 *   - strips ``` fences and any prose around the array;
 *   - retries after removing trailing commas;
 *   - salvages truncated output (finishReason 'length') by cutting
 *     back to the last complete object and closing the array;
 *   - accepts "MM:SS", "H:MM:SS", "HH:MM:SS", and bare-seconds
 *     numbers as timestamps;
 *   - skips entries with missing/invalid fields, clamps `endMs` to be
 *     ≥ `startMs`, drops non-monotonic entries, and (when the video
 *     duration is known) drops segments starting past the end while
 *     clamping overshooting `endMs`.
 *
 * Throws {@link TranscriptParseError} when no valid segments remain.
 */
export function parseGeneratedTranscript(
  raw: string,
  opts: { durationMs: number | null }
): TranscriptSegment[] {
  const entries = extractJsonArray(raw);

  const segments: TranscriptSegment[] = [];
  for (const entry of entries) {
    if (entry == null || typeof entry !== 'object') {
      continue;
    }
    const { start, end, text } = entry as RawSegment;
    if (typeof text !== 'string' || text.trim().length === 0) {
      continue;
    }
    const startMs = parseTimestampMs(start);
    const endMs = parseTimestampMs(end);
    if (startMs == null || endMs == null) {
      continue;
    }

    const previous = segments[segments.length - 1];
    if (previous != null && startMs < previous.startMs) {
      // Out-of-order timestamps are model glitches; keeping them would
      // break the reader's seek-sync assumptions.
      continue;
    }
    if (opts.durationMs != null && startMs > opts.durationMs) {
      continue;
    }

    let clampedEndMs = Math.max(endMs, startMs);
    if (opts.durationMs != null && clampedEndMs > opts.durationMs) {
      clampedEndMs = opts.durationMs;
    }
    segments.push({ startMs, endMs: clampedEndMs, text: text.trim() });
  }

  if (segments.length === 0) {
    throw new TranscriptParseError('Model response contained no valid transcript segments');
  }
  return segments;
}

/**
 * Locate and parse the JSON array in a model response, tolerating
 * fences, surrounding prose, trailing commas, and tail truncation.
 */
function extractJsonArray(raw: string): unknown[] {
  const firstBracket = raw.indexOf('[');
  const lastBracket = raw.lastIndexOf(']');
  if (firstBracket === -1) {
    throw new TranscriptParseError('Model response contains no JSON array');
  }
  const candidate =
    lastBracket > firstBracket
      ? raw.slice(firstBracket, lastBracket + 1)
      : // No closing bracket at all — response was cut off mid-array.
        raw.slice(firstBracket);

  const attempts = [candidate, stripTrailingCommas(candidate), salvageTruncated(candidate)];
  for (const attempt of attempts) {
    if (attempt == null) {
      continue;
    }
    try {
      const parsed: unknown = JSON.parse(attempt);
      if (Array.isArray(parsed)) {
        return parsed;
      }
    } catch {
      // Fall through to the next, more aggressive repair.
    }
  }
  throw new TranscriptParseError('Model response is not parseable as a JSON array');
}

function stripTrailingCommas(candidate: string): string {
  return candidate.replace(/,\s*([\]}])/g, '$1');
}

/**
 * Repair output truncated by the max-output-token ceiling: cut back
 * to the last complete `}` and close the array. Returns null when
 * there is no complete object to salvage.
 */
function salvageTruncated(candidate: string): string | null {
  const lastBrace = candidate.lastIndexOf('}');
  if (lastBrace === -1) {
    return null;
  }
  return stripTrailingCommas(`${candidate.slice(0, lastBrace + 1)}]`);
}

/**
 * Parse a model-emitted timestamp into milliseconds. Accepts
 * "MM:SS" / "H:MM:SS" / "HH:MM:SS" strings (minutes/seconds may
 * exceed 59 in sloppy output, e.g. "90:12") and bare numbers meaning
 * seconds. Returns null for anything else.
 */
function parseTimestampMs(value: unknown): number | null {
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value < 0) {
      return null;
    }
    return Math.round(value * 1000);
  }
  if (typeof value !== 'string') {
    return null;
  }
  const parts = value.trim().split(':');
  if (parts.length < 2 || parts.length > 3) {
    return null;
  }
  const numbers = parts.map((part) => (/^\d+$/.test(part) ? Number(part) : null));
  if (numbers.some((n) => n == null)) {
    return null;
  }
  const [a, b, c] = numbers as number[];
  const totalSeconds = parts.length === 3 ? a * 3600 + b * 60 + c : a * 60 + b;
  return totalSeconds * 1000;
}
