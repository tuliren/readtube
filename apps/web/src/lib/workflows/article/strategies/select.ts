import { MAP_REDUCE_THRESHOLD_MINUTES } from '@/constants';

import { mapReduceStrategy } from './mapReduce';
import { singlePassStrategy } from './singlePass';
import type { ArticleGenerationStrategy, ArticleWorkflowInput } from './types';

/**
 * Pick a generation strategy by source video duration. Below the
 * threshold the existing single-pass LLM call writes the whole
 * article in one go; at/above the threshold the map-reduce strategy
 * decomposes the work into bounded per-section calls + a reduce
 * pass. Tune via {@link MAP_REDUCE_THRESHOLD_MINUTES}.
 *
 * Unknown duration → single-pass. We keep the existing path as the
 * conservative default until we have signal that the workflow input
 * carries duration; the route is updated to populate it, but legacy
 * runs without it should continue to work.
 */
export function selectStrategy(input: ArticleWorkflowInput): ArticleGenerationStrategy {
  if (input.durationSeconds != null && input.durationSeconds >= MAP_REDUCE_THRESHOLD_MINUTES * 60) {
    return mapReduceStrategy;
  }
  return singlePassStrategy;
}
