import { ArticleStyle } from '@readtube/database';

import { MAP_REDUCE_THRESHOLD_MINUTES } from '@/constants';

import { mapReduceStrategy } from './mapReduce';
import { selectStrategy } from './select';
import { singlePassStrategy } from './singlePass';
import type { ArticleWorkflowInput } from './types';

function input(durationSeconds: number | null): ArticleWorkflowInput {
  return {
    transcriptId: 'tr',
    style: ArticleStyle.NARRATIVE,
    language: null,
    segments: [],
    videoTitle: 'Title',
    channelName: 'Channel',
    sourceLanguage: null,
    durationSeconds,
  };
}

describe('selectStrategy', () => {
  it.each<[string, number | null, typeof singlePassStrategy | typeof mapReduceStrategy]>([
    ['null duration → single-pass', null, singlePassStrategy],
    ['way under threshold → single-pass', 60, singlePassStrategy],
    [
      'just under threshold → single-pass',
      MAP_REDUCE_THRESHOLD_MINUTES * 60 - 1,
      singlePassStrategy,
    ],
    ['at threshold → map-reduce', MAP_REDUCE_THRESHOLD_MINUTES * 60, mapReduceStrategy],
    ['way over threshold → map-reduce', MAP_REDUCE_THRESHOLD_MINUTES * 60 * 10, mapReduceStrategy],
  ])('%s', (_label, durationSeconds, expected) => {
    expect(selectStrategy(input(durationSeconds))).toBe(expected);
  });
});
