import { type ArticleStyle, Prisma, prisma } from '@readtube/database';
import { Output, streamText } from 'ai';
import { FatalError, getWritable } from 'workflow';
import { z } from 'zod';

import { DEFAULT_AI_MODEL } from '@/constants';
import { CURRENT_FRONTMATTER_VERSION, serializeMarkdownDocument } from '@/lib/markdownFrontmatter';

export const ARTICLE_PROMPT_VERSION = 'v8';

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

    try {
      for await (const partial of result.partialOutputStream) {
        if (partial == null) {
          continue;
        }
        if (typeof partial.content === 'string' && partial.content.length > accumulated.length) {
          const delta = partial.content.slice(accumulated.length);
          accumulated = partial.content;
          await writer.write({ delta });
        }
        if (!emittedHasLatex && typeof partial.hasLatex === 'boolean') {
          emittedHasLatex = true;
          hasLatex = partial.hasLatex;
          await writer.write({ hasLatex });
        }
      }

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
        return;
      }
    }
    throw err;
  }
}

export async function emitTerminalEventStep(event: ArticleStreamEvent): Promise<void> {
  'use step';

  const writable = getWritable<ArticleStreamEvent>();
  const writer = writable.getWriter();
  try {
    await writer.write(event);
  } finally {
    writer.releaseLock();
  }
  await getWritable<ArticleStreamEvent>().close();
}
