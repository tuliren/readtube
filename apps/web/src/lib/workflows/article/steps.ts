import { type ArticleStyle, Prisma, prisma } from '@readtube/database';
import { Output, streamText } from 'ai';
import { FatalError, getWritable } from 'workflow';
import { z } from 'zod';

import { DEFAULT_AI_MODEL } from '@/constants';
import { CURRENT_FRONTMATTER_VERSION, serializeMarkdownDocument } from '@/lib/markdownFrontmatter';
import { emitTerminalEvent } from '@/lib/workflows/emitTerminalEvent';
import { clearArticleRunSlot } from '@/lib/workflows/runRegistry';

export const ARTICLE_PROMPT_VERSION = 'v9';

export const ARTICLE_SCHEMA = z.object({
  content: z
    .string()
    .describe('The markdown body of the article. Do not include any YAML frontmatter.'),
  hasLatex: z
    .boolean()
    .describe(
      'True if the content field above contains at least one LaTeX math formula wrapped in single or double dollar signs (e.g. $E = mc^2$ or $$\\int_0^1 x\\,dx$$). False otherwise. Dollar amounts like "$5 million" are not math and must not set this flag to true.'
    ),
});

export type ArticleStreamEvent =
  | { delta: string }
  | { hasLatex: boolean }
  | { type: 'done' }
  | { error: string };

export interface ArticleWorkflowInput {
  prompt: string;
  transcriptId: string;
  style: ArticleStyle;
  language: string | null;
}

export interface GeneratedArticle {
  content: string;
  hasLatex: boolean;
  usage: unknown;
}

// Coalesce token-level deltas before each `writer.write()`. The
// workflow stream is Redis-backed, so every write is a network op;
// `streamText`'s structured-output partials arrive every few tokens,
// which produced hundreds of round-trips per article. Buffering until
// either ~60 chars accumulate or ~80 ms pass keeps the reading
// experience smooth (sub-100 ms gaps are imperceptible) while
// dropping the write count by an order of magnitude.
const FLUSH_CHARS = 60;
const FLUSH_INTERVAL_MS = 80;

export async function generateArticleStep(input: ArticleWorkflowInput): Promise<GeneratedArticle> {
  'use step';

  const writable = getWritable<ArticleStreamEvent>();
  const writer = writable.getWriter();

  try {
    const result = streamText({
      model: DEFAULT_AI_MODEL,
      output: Output.object({ schema: ARTICLE_SCHEMA }),
      prompt: input.prompt,
    });

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

    try {
      for await (const partial of result.partialOutputStream) {
        if (partial == null) {
          continue;
        }
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
      }

      // Final flush of any tail content shorter than FLUSH_CHARS.
      await flushDelta();

      if (!emittedHasLatex) {
        try {
          const settled = await result.output;
          hasLatex = settled.hasLatex;
          emittedHasLatex = true;
          await writer.write({ hasLatex });
        } catch {
          // Swallow — body already streamed.
        }
      }
    } catch (err) {
      console.error('[articleWorkflow] streamText error:', err);
      const message = err instanceof Error ? err.message : 'Failed to generate article.';
      // Don't retry — partial deltas are already on the wire and a
      // retry would re-stream them. Surface as a terminal error.
      throw new FatalError(message);
    }

    if (accumulated.trim().length === 0) {
      throw new FatalError('Generation produced no content');
    }

    let usage: unknown = null;
    try {
      usage = await result.usage;
    } catch {
      // Usage is best-effort.
    }

    return {
      content: accumulated.trim(),
      hasLatex: hasLatex === true,
      usage,
    };
  } finally {
    writer.releaseLock();
  }
}

export async function persistArticleStep(
  input: ArticleWorkflowInput & GeneratedArticle
): Promise<void> {
  'use step';

  const contentForStorage = serializeMarkdownDocument(input.content, {
    version: CURRENT_FRONTMATTER_VERSION,
    hasLatex: input.hasLatex,
  });

  const articleData = {
    prompt_version: ARTICLE_PROMPT_VERSION,
    model: DEFAULT_AI_MODEL,
    content: contentForStorage,
    usage: input.usage != null ? JSON.parse(JSON.stringify(input.usage)) : null,
  };

  // Manual upsert keyed on (transcript_id, style, language). Prisma
  // can't model the partial unique indexes that enforce this, so we
  // use findFirst + create with a P2002 retry for the rare race where
  // another writer takes the same slot between find and create.
  const existing = await prisma.article.findFirst({
    where: { transcript_id: input.transcriptId, style: input.style, language: input.language },
    select: { id: true },
  });
  if (existing) {
    await prisma.article.update({
      where: { id: existing.id },
      data: { ...articleData, generated_at: new Date() },
    });
    await clearArticleRunSlot(prisma, input.transcriptId, input.style, input.language);
    return;
  }
  try {
    await prisma.article.create({
      data: {
        transcript_id: input.transcriptId,
        style: input.style,
        language: input.language,
        ...articleData,
      },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      const raced = await prisma.article.findFirst({
        where: {
          transcript_id: input.transcriptId,
          style: input.style,
          language: input.language,
        },
        select: { id: true },
      });
      if (raced) {
        await prisma.article.update({
          where: { id: raced.id },
          data: { ...articleData, generated_at: new Date() },
        });
        await clearArticleRunSlot(prisma, input.transcriptId, input.style, input.language);
        return;
      }
    }
    throw err;
  }
  await clearArticleRunSlot(prisma, input.transcriptId, input.style, input.language);
}

export async function emitTerminalEventStep(event: ArticleStreamEvent): Promise<void> {
  'use step';
  await emitTerminalEvent(event);
}
