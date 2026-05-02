import { MAP_REDUCE_THRESHOLD_MINUTES } from '@/constants';
import { countWords, readingTimeMinutes } from '@/lib/format/wordCount';

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
 * If `durationSeconds` is missing on the input, fall back to the
 * estimated reading time of the transcript text (words ÷
 * {@link READING_WPM}). That's a conservative proxy: the wall-clock
 * cost of a single-pass LLM call scales with output length, which in
 * turn scales with transcript length, so a long transcript should
 * trigger map-reduce regardless of whether the platform handed us a
 * `duration_seconds` value.
 */
export function selectStrategy(input: ArticleWorkflowInput): ArticleGenerationStrategy {
  const effectiveSeconds = input.durationSeconds ?? estimateSecondsFromTranscript(input);
  if (effectiveSeconds != null && effectiveSeconds >= MAP_REDUCE_THRESHOLD_MINUTES * 60) {
    return mapReduceStrategy;
  }
  return singlePassStrategy;
}

function estimateSecondsFromTranscript(input: ArticleWorkflowInput): number | null {
  if (input.segments == null || input.segments.length === 0) {
    return null;
  }
  const transcriptText = input.segments.map((s) => s.text).join(' ');
  const words = countWords(transcriptText);
  if (words === 0) {
    return null;
  }
  return readingTimeMinutes(words) * 60;
}
