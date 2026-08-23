import type { TranscriptSegment } from '@/lib/platforms/types';
import {
  normalizeWindowTimestamps,
  planTranscriptWindows,
  stitchWindowSegments,
} from '@/lib/transcripts/transcriptWindows';

const seg = (startMs: number, endMs: number, text = 'x'): TranscriptSegment => ({
  startMs,
  endMs,
  text,
});

describe('planTranscriptWindows', () => {
  it.each<{ desc: string; duration: number; chunk: number; expected: Array<[number, number]> }>([
    {
      desc: 'video shorter than a chunk yields one full window',
      duration: 1800,
      chunk: 2700,
      expected: [[0, 1800]],
    },
    {
      desc: 'exact multiple splits evenly',
      duration: 5400,
      chunk: 2700,
      expected: [
        [0, 2700],
        [2700, 5400],
      ],
    },
    {
      desc: 'remainder becomes a short final window',
      duration: 7907,
      chunk: 2700,
      expected: [
        [0, 2700],
        [2700, 5400],
        [5400, 7907],
      ],
    },
  ])('$desc', ({ duration, chunk, expected }) => {
    expect(planTranscriptWindows(duration, chunk).map((w) => [w.startSec, w.endSec])).toEqual(
      expected
    );
  });

  it.each<{ desc: string; duration: number; chunk: number }>([
    { desc: 'zero duration', duration: 0, chunk: 2700 },
    { desc: 'negative duration', duration: -5, chunk: 2700 },
    { desc: 'non-positive chunk', duration: 100, chunk: 0 },
  ])('returns a single window for $desc', ({ duration, chunk }) => {
    expect(planTranscriptWindows(duration, chunk)).toHaveLength(1);
  });
});

describe('normalizeWindowTimestamps', () => {
  it('leaves the first window (start 0) unchanged', () => {
    const segs = [seg(0, 5000), seg(5000, 10_000)];
    expect(normalizeWindowTimestamps(segs, { startSec: 0, endSec: 2700 })).toEqual(segs);
  });

  it('leaves absolute timestamps unchanged (max exceeds window length)', () => {
    // Window [2700, 5400]; timestamps already at ~2700s+.
    const segs = [seg(2_700_000, 2_705_000), seg(2_705_000, 2_710_000)];
    expect(normalizeWindowTimestamps(segs, { startSec: 2700, endSec: 5400 })).toEqual(segs);
  });

  it('offsets clip-relative timestamps by the window start', () => {
    // Window [2700, 5400] (length 2700s); model returned 0-based times.
    const segs = [seg(0, 5000), seg(5000, 10_000)];
    expect(normalizeWindowTimestamps(segs, { startSec: 2700, endSec: 5400 })).toEqual([
      seg(2_700_000, 2_705_000),
      seg(2_705_000, 2_710_000),
    ]);
  });

  it('returns empty input unchanged', () => {
    expect(normalizeWindowTimestamps([], { startSec: 2700, endSec: 5400 })).toEqual([]);
  });
});

describe('stitchWindowSegments', () => {
  it('concatenates windows in order', () => {
    const stitched = stitchWindowSegments(
      [[seg(0, 5000), seg(5000, 10_000)], [seg(2_700_000, 2_705_000)]],
      5400
    );
    expect(stitched.map((s) => s.startMs)).toEqual([0, 5000, 2_700_000]);
  });

  it('drops a segment whose start moves backward across the seam', () => {
    const stitched = stitchWindowSegments(
      [
        [seg(0, 1000), seg(2_700_000, 2_701_000)],
        // Later window bleeds a segment starting before the prior start.
        [seg(2_699_000, 2_701_500), seg(2_702_000, 2_705_000)],
      ],
      5400
    );
    expect(stitched.map((s) => s.startMs)).toEqual([0, 2_700_000, 2_702_000]);
  });

  it('clamps an overshooting end and drops a segment starting past the end', () => {
    const stitched = stitchWindowSegments([[seg(50_000, 70_000), seg(120_000, 130_000)]], 60);
    expect(stitched).toEqual([seg(50_000, 60_000)]);
  });
});
