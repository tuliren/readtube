import { ArticleStyle } from '@readtube/database';

import { MAP_REDUCE_THRESHOLD_MINUTES } from '@/constants';
import type { TranscriptSegment } from '@/lib/platforms/types';

import { mapReduceStrategy } from '../mapReduce';
import { selectStrategy } from '../select';
import { singlePassStrategy } from '../singlePass';
import type { ArticleWorkflowInput } from '../types';

function input(
  durationSeconds: number | null,
  segments: TranscriptSegment[] = []
): ArticleWorkflowInput {
  return {
    transcriptId: 'tr',
    style: ArticleStyle.NARRATIVE,
    language: null,
    segments,
    videoTitle: 'Title',
    channelName: 'Channel',
    sourceLanguage: null,
    durationSeconds,
  };
}

function makeWords(n: number): string {
  return Array.from({ length: n }, (_, i) => `w${i}`).join(' ');
}

describe('selectStrategy', () => {
  describe('with explicit durationSeconds', () => {
    it.each<[string, number | null, typeof singlePassStrategy | typeof mapReduceStrategy]>([
      ['way under threshold → single-pass', 60, singlePassStrategy],
      [
        'just under threshold → single-pass',
        MAP_REDUCE_THRESHOLD_MINUTES * 60 - 1,
        singlePassStrategy,
      ],
      ['at threshold → map-reduce', MAP_REDUCE_THRESHOLD_MINUTES * 60, mapReduceStrategy],
      [
        'way over threshold → map-reduce',
        MAP_REDUCE_THRESHOLD_MINUTES * 60 * 10,
        mapReduceStrategy,
      ],
    ])('%s', (_label, durationSeconds, expected) => {
      expect(selectStrategy(input(durationSeconds))).toBe(expected);
    });
  });

  describe('with missing durationSeconds — falls back to transcript reading time', () => {
    it('null duration + no segments → single-pass', () => {
      expect(selectStrategy(input(null, []))).toBe(singlePassStrategy);
    });

    it('null duration + short transcript → single-pass', () => {
      // ~500 words ≈ 3 min reading time, well under threshold.
      const segments: TranscriptSegment[] = [{ startMs: 0, endMs: 1000, text: makeWords(500) }];
      expect(selectStrategy(input(null, segments))).toBe(singlePassStrategy);
    });

    it('null duration + very long transcript → map-reduce', () => {
      // 50_000 words at 230 wpm ≈ 218 min reading time, well over the
      // 45-minute threshold. Spread across a few segments to mirror
      // real input shape.
      const segments: TranscriptSegment[] = Array.from({ length: 5 }, (_, i) => ({
        startMs: i * 1000,
        endMs: (i + 1) * 1000,
        text: makeWords(10_000),
      }));
      expect(selectStrategy(input(null, segments))).toBe(mapReduceStrategy);
    });

    it('explicit duration takes precedence over the estimate', () => {
      // Transcript content suggests a very long article, but the
      // platform-reported duration is short — trust the explicit value.
      const segments: TranscriptSegment[] = [{ startMs: 0, endMs: 1000, text: makeWords(100_000) }];
      expect(selectStrategy(input(60, segments))).toBe(singlePassStrategy);
    });
  });
});
