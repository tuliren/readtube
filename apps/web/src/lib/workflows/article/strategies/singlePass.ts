import { FatalError } from 'workflow';
import { z } from 'zod';

import { buildSinglePassPrompt } from './prompts';
import { streamWithGuards } from './streamWithGuards';
import type {
  ArticleGenerationStrategy,
  ArticleWorkflowInput,
  GeneratedArticle,
  GenerationContext,
} from './types';

export const SINGLE_PASS_SCHEMA = z.object({
  content: z
    .string()
    .describe('The markdown body of the article. Do not include any YAML frontmatter.'),
  hasLatex: z
    .boolean()
    .describe(
      'True if the content field above contains at least one LaTeX math formula wrapped in single or double dollar signs (e.g. $E = mc^2$ or $$\\int_0^1 x\\,dx$$). False otherwise. Dollar amounts like "$5 million" are not math and must not set this flag to true.'
    ),
});

// Coalesce token-level deltas before each `writer.write()`. The
// workflow stream is Redis-backed, so every write is a network op;
// `streamText`'s structured-output partials arrive every few tokens,
// which produced hundreds of round-trips per article. Buffering until
// either ~60 chars accumulate or ~80 ms pass keeps the reading
// experience smooth (sub-100 ms gaps are imperceptible) while
// dropping the write count by an order of magnitude.
const FLUSH_CHARS = 60;
const FLUSH_INTERVAL_MS = 80;

export const singlePassStrategy: ArticleGenerationStrategy = {
  name: 'single-pass',

  async generate(
    input: ArticleWorkflowInput,
    context: GenerationContext
  ): Promise<GeneratedArticle> {
    const { writer } = context;

    let accumulated = '';
    let hasLatex: boolean | null = null;
    let emittedHasLatex = false;
    let pending = '';
    let lastFlushAt = Date.now();

    const flushDelta = async () => {
      if (pending.length === 0) {
        return;
      }
      await writer.write({ delta: pending });
      pending = '';
      lastFlushAt = Date.now();
    };

    let result;
    try {
      result = await streamWithGuards({
        label: 'articleWorkflow:single-pass',
        prompt: buildSinglePassPrompt(input),
        schema: SINGLE_PASS_SCHEMA,
        // Once *any* delta or hasLatex flag has reached the client, a
        // retry would re-stream content the reader already saw, so
        // surface the error instead.
        canRetry: () => accumulated.length === 0 && !emittedHasLatex,
        onPartial: async (partial) => {
          if (typeof partial.content === 'string' && partial.content.length > accumulated.length) {
            const delta = partial.content.slice(accumulated.length);
            accumulated = partial.content;
            pending += delta;
            if (pending.length >= FLUSH_CHARS || Date.now() - lastFlushAt >= FLUSH_INTERVAL_MS) {
              await flushDelta();
            }
          }
          if (!emittedHasLatex && typeof partial.hasLatex === 'boolean') {
            // Drain any pending content before the flag so order is
            // preserved on the wire.
            await flushDelta();
            emittedHasLatex = true;
            hasLatex = partial.hasLatex;
            await writer.write({ hasLatex });
          }
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to generate article.';
      throw new FatalError(message);
    }

    // Final flush of any tail content shorter than FLUSH_CHARS.
    await flushDelta();

    if (!emittedHasLatex && result.output != null) {
      hasLatex = result.output.hasLatex;
      emittedHasLatex = true;
      await writer.write({ hasLatex });
    }

    if (accumulated.trim().length === 0) {
      throw new FatalError('Generation produced no content');
    }

    return {
      content: accumulated.trim(),
      hasLatex: hasLatex === true,
      usage: result.usage,
    };
  },
};
