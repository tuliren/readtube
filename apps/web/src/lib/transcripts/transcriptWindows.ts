import type { TranscriptSegment } from '@/lib/platforms/types';

export interface TranscriptWindow {
  /** Inclusive start offset, seconds into the original video. */
  startSec: number;
  /** Exclusive end offset, seconds into the original video. */
  endSec: number;
}

/**
 * Split a video of `durationSec` into contiguous, non-overlapping
 * windows of at most `chunkSec` each. A video at or under one chunk
 * yields a single window covering the whole thing. Always returns at
 * least one window.
 */
export function planTranscriptWindows(durationSec: number, chunkSec: number): TranscriptWindow[] {
  if (
    !Number.isFinite(durationSec) ||
    durationSec <= 0 ||
    !Number.isFinite(chunkSec) ||
    chunkSec <= 0
  ) {
    return [{ startSec: 0, endSec: Math.max(0, durationSec) }];
  }
  const windows: TranscriptWindow[] = [];
  for (let start = 0; start < durationSec; start += chunkSec) {
    windows.push({ startSec: start, endSec: Math.min(start + chunkSec, durationSec) });
  }
  return windows;
}

// A window's segments look clip-relative (0-based) rather than absolute
// when their furthest timestamp lands within the window's own length.
// Gemini has been observed to return ABSOLUTE (original-video) timestamps
// for clipped windows, so this offset is a safety net for the rare case
// where a window comes back 0-based instead.
const RELATIVE_DETECTION_SLACK_MS = 5_000;

/**
 * Ensure a window's segment timestamps are in absolute (original-video)
 * time. For the first window (startSec 0) absolute and relative are
 * identical. For later windows, if every timestamp fits within the
 * window's own duration it was almost certainly emitted clip-relative,
 * so shift it by the window's start offset.
 */
export function normalizeWindowTimestamps(
  segments: TranscriptSegment[],
  window: TranscriptWindow
): TranscriptSegment[] {
  if (window.startSec <= 0 || segments.length === 0) {
    return segments;
  }
  const maxEndMs = segments.reduce((max, s) => Math.max(max, s.endMs), 0);
  const windowLengthMs = (window.endSec - window.startSec) * 1000;
  if (maxEndMs > windowLengthMs + RELATIVE_DETECTION_SLACK_MS) {
    // Timestamps already exceed the window length → absolute.
    return segments;
  }
  const offsetMs = window.startSec * 1000;
  return segments.map((s) => ({
    startMs: s.startMs + offsetMs,
    endMs: s.endMs + offsetMs,
    text: s.text,
  }));
}

/**
 * Concatenate per-window segments (already in absolute time and window
 * order) into one transcript: clamp to the video duration, enforce a
 * single monotonic timeline across window seams, and drop anything that
 * starts past the end. Mirrors the in-call rules in
 * `parseGeneratedTranscript` but applied across the stitched result.
 */
export function stitchWindowSegments(
  windowSegments: TranscriptSegment[][],
  durationSec: number
): TranscriptSegment[] {
  const durationMs = durationSec > 0 ? durationSec * 1000 : null;
  const stitched: TranscriptSegment[] = [];
  for (const segments of windowSegments) {
    for (const segment of segments) {
      if (durationMs != null && segment.startMs > durationMs) {
        continue;
      }
      const previous = stitched[stitched.length - 1];
      if (previous != null && segment.startMs < previous.startMs) {
        // Boundary overlap or model glitch — keep the timeline monotonic.
        continue;
      }
      let endMs = Math.max(segment.endMs, segment.startMs);
      if (durationMs != null && endMs > durationMs) {
        endMs = durationMs;
      }
      stitched.push({ startMs: segment.startMs, endMs, text: segment.text });
    }
  }
  return stitched;
}
