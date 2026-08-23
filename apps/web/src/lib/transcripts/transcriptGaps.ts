import type { TranscriptSegment } from '@/lib/platforms/types';

/** A stretch of the video that the transcript does not cover, in whole
 *  seconds of original-video time. */
export interface TranscriptGap {
  startSec: number;
  endSec: number;
}

/**
 * Find the stretches a transcript leaves uncovered — the tell that AI
 * generation dropped part of the video (a content-policy block skips a
 * whole window; an output-token truncation drops the tail). Reports the
 * leading gap (video start → first segment), internal gaps (between
 * consecutive segments), and the trailing gap (last segment → video
 * end), keeping only those at least `minGapSeconds` long so natural
 * pauses and short non-speech stretches don't read as missing content.
 *
 * Segments are expected in monotonic order (the parser enforces this),
 * but this sorts defensively and tracks the running max end so an
 * out-of-order or overlapping segment can't invent a phantom gap.
 */
export function computeTranscriptGaps(
  segments: TranscriptSegment[],
  durationSeconds: number | null,
  minGapSeconds: number
): TranscriptGap[] {
  if (segments.length === 0) {
    return [];
  }
  const minGapMs = minGapSeconds * 1000;
  const sorted = [...segments].sort((a, b) => a.startMs - b.startMs);
  const gaps: TranscriptGap[] = [];

  // Leading gap: the video runs for a while before the first words.
  if (sorted[0].startMs >= minGapMs) {
    gaps.push({ startSec: 0, endSec: Math.round(sorted[0].startMs / 1000) });
  }

  // Internal gaps: compare each segment's start against the furthest
  // end seen so far, so an overlapping segment shortens rather than
  // fabricates a gap.
  let coveredToMs = sorted[0].endMs;
  for (let i = 1; i < sorted.length; i++) {
    const seg = sorted[i];
    if (seg.startMs - coveredToMs >= minGapMs) {
      gaps.push({
        startSec: Math.round(coveredToMs / 1000),
        endSec: Math.round(seg.startMs / 1000),
      });
    }
    if (seg.endMs > coveredToMs) {
      coveredToMs = seg.endMs;
    }
  }

  // Trailing gap: transcript ends well before the video does.
  if (durationSeconds != null) {
    const durationMs = durationSeconds * 1000;
    if (durationMs - coveredToMs >= minGapMs) {
      gaps.push({ startSec: Math.round(coveredToMs / 1000), endSec: durationSeconds });
    }
  }

  return gaps;
}
