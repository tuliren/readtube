import type { TranscriptSegment } from '@/lib/platforms/types';
import { formatTimestamp, groupTranscriptSegments } from '@/lib/platforms/youtube/transcript';

function seg(text: string, startMs: number, endMs: number): TranscriptSegment {
  return { text, startMs, endMs };
}

describe('groupTranscriptSegments', () => {
  it('returns empty array for empty input', () => {
    expect(groupTranscriptSegments([])).toEqual([]);
  });

  it('filters out filler segments', () => {
    const segments = [
      seg('[Music]', 0, 2000),
      seg('Hello world.', 2000, 4000),
      seg('[Applause]', 4000, 5000),
    ];
    const result = groupTranscriptSegments(segments);
    expect(result).toHaveLength(1);
    expect(result[0].text).toBe('Hello world.');
  });

  it('groups segments without pause into one paragraph', () => {
    const segments = [seg('first', 0, 500), seg('second', 600, 1100), seg('third', 1200, 1700)];
    const result = groupTranscriptSegments(segments);
    expect(result).toHaveLength(1);
    expect(result[0].text).toBe('First second third');
  });

  it('splits on pause gap > 2000ms', () => {
    const segments = [
      seg('first paragraph.', 0, 500),
      seg('second paragraph.', 3000, 4000), // 2500ms gap
    ];
    const result = groupTranscriptSegments(segments);
    expect(result).toHaveLength(2);
    expect(result[0].text).toBe('First paragraph.');
    expect(result[1].text).toBe('Second paragraph.');
  });

  it('splits on max segments per paragraph', () => {
    const segments = Array.from({ length: 10 }, (_, i) => seg(`word${i}`, i * 100, i * 100 + 50));
    const result = groupTranscriptSegments(segments);
    expect(result.length).toBeGreaterThan(1);
  });

  it('capitalizes the first letter of each paragraph', () => {
    const segments = [seg('lower case start', 0, 500)];
    const result = groupTranscriptSegments(segments);
    expect(result[0].text.charAt(0)).toBe('L');
  });

  it('tracks correct startMs and endMs for each paragraph', () => {
    const segments = [seg('a', 1000, 1500), seg('b', 1600, 2000)];
    const result = groupTranscriptSegments(segments);
    expect(result[0].startMs).toBe(1000);
    expect(result[0].endMs).toBe(2000);
  });
});

describe('formatTimestamp', () => {
  it.each([
    [0, '0:00'],
    [5000, '0:05'],
    [65000, '1:05'],
    [3661000, '1:01:01'],
    [3600000, '1:00:00'],
  ])('formats %dms as %s', (ms, expected) => {
    expect(formatTimestamp(ms)).toBe(expected);
  });
});
