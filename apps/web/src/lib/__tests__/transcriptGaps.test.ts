import type { TranscriptSegment } from '@/lib/platforms/types';
import { computeTranscriptGaps } from '@/lib/transcripts/transcriptGaps';

const seg = (startSec: number, endSec: number): TranscriptSegment => ({
  startMs: startSec * 1000,
  endMs: endSec * 1000,
  text: 'x',
});

// Threshold used across cases: gaps of 120s+ count.
const MIN = 120;

describe('computeTranscriptGaps', () => {
  it.each<{ desc: string; segments: TranscriptSegment[]; duration: number | null }>([
    { desc: 'empty segments', segments: [], duration: 600 },
    {
      desc: 'contiguous coverage with only sub-threshold pauses',
      segments: [seg(0, 60), seg(70, 130), seg(140, 600)],
      duration: 600,
    },
    {
      desc: 'a leading pause shorter than the threshold',
      segments: [seg(90, 300), seg(300, 600)],
      duration: 600,
    },
    {
      desc: 'a trailing pause shorter than the threshold',
      segments: [seg(0, 500)],
      duration: 600,
    },
    {
      desc: 'overlapping segments that would otherwise fake a gap',
      segments: [seg(0, 400), seg(100, 600)],
      duration: 600,
    },
  ])('returns no gaps for $desc', ({ segments, duration }) => {
    expect(computeTranscriptGaps(segments, duration, MIN)).toEqual([]);
  });

  it('flags an internal gap (a blocked window)', () => {
    // Covers 0-6000s, then jumps to 7200s: the 20-min blocked window.
    const segments = [seg(0, 6000), seg(7200, 7900)];
    expect(computeTranscriptGaps(segments, 7923, MIN)).toEqual([{ startSec: 6000, endSec: 7200 }]);
  });

  it('flags a leading gap', () => {
    expect(computeTranscriptGaps([seg(300, 600)], 600, MIN)).toEqual([
      { startSec: 0, endSec: 300 },
    ]);
  });

  it('flags a trailing gap up to the known duration', () => {
    expect(computeTranscriptGaps([seg(0, 400)], 700, MIN)).toEqual([
      { startSec: 400, endSec: 700 },
    ]);
  });

  it('skips the trailing gap when duration is unknown', () => {
    expect(computeTranscriptGaps([seg(0, 400)], null, MIN)).toEqual([]);
  });

  it('reports multiple gaps in order', () => {
    const segments = [seg(200, 1000), seg(2500, 3000)];
    expect(computeTranscriptGaps(segments, 4000, MIN)).toEqual([
      { startSec: 0, endSec: 200 },
      { startSec: 1000, endSec: 2500 },
      { startSec: 3000, endSec: 4000 },
    ]);
  });

  it('measures internal gaps from the furthest end, not the previous segment', () => {
    // A short overlapping segment must not reset coverage backwards.
    const segments = [seg(0, 3000), seg(100, 200), seg(3050, 3600)];
    expect(computeTranscriptGaps(segments, 3600, MIN)).toEqual([]);
  });
});
