import { z } from 'zod';

import { buildReducePrompt } from '../prompts';
import { streamWithGuards } from '../streamWithGuards';
import type { ArticleWorkflowInput } from '../types';

export interface SectionBrief {
  index: number;
  topic: string;
  /** First ~100 words of the section body, used as context for the reduce call. */
  brief: string;
}

export interface ReducedOutline {
  articleTitle: string;
  /**
   * One entry per input section, same order. An empty string means
   * "render this section without its own heading" (the assembler
   * appends the body straight after the previous section).
   */
  headings: string[];
  usage: unknown;
}

const REDUCE_SCHEMA = z.object({
  articleTitle: z
    .string()
    .describe(
      "5–10 word title for the entire article. Reflects the article's actual content; will be displayed alongside the video title."
    ),
  headings: z
    .array(z.string())
    .describe(
      "One heading per section, in the same order as the input sections. Empty string means: render this section as a continuation of the previous one, with no heading of its own. Avoid generic headings like 'Introduction' or 'Part 1' unless they're genuinely the most descriptive choice."
    ),
});

/**
 * One small LLM call that consolidates per-section topics into a
 * coherent article outline + a top-level title. Operates only on the
 * map outputs (topics + brief excerpts), never on the full transcript
 * or full bodies — bounded input regardless of source length.
 */
export async function reduceOutline(
  input: ArticleWorkflowInput,
  briefs: SectionBrief[]
): Promise<ReducedOutline> {
  const result = await streamWithGuards({
    label: 'articleWorkflow:map-reduce:reduce',
    prompt: buildReducePrompt(input, briefs),
    schema: REDUCE_SCHEMA,
    onPartial: async () => {
      // No client streaming during the reduce pass; the watchdog only
      // needs to see partials to know the call is making progress.
    },
  });

  if (result.output == null) {
    throw new Error('Reduce pass produced no structured output.');
  }

  // Belt-and-suspenders: the model occasionally returns fewer or more
  // headings than sections. Pad with empty strings if short, truncate
  // if long — the assembler treats empty as "no heading".
  const headings = [...result.output.headings];
  while (headings.length < briefs.length) {
    headings.push('');
  }
  if (headings.length > briefs.length) {
    headings.length = briefs.length;
  }

  return {
    articleTitle: result.output.articleTitle,
    headings,
    usage: result.usage,
  };
}
