import { GenerationStatus, Prisma, prisma } from '@readtube/database';
import { FatalError, getWorkflowMetadata, getWritable } from 'workflow';

import { DEFAULT_AI_MODEL } from '@/constants';
import { CURRENT_FRONTMATTER_VERSION, serializeMarkdownDocument } from '@/lib/markdownFrontmatter';
import { emitTerminalEvent } from '@/lib/workflows/emitTerminalEvent';
import { revertArticleRow } from '@/lib/workflows/runRegistry';

import { selectStrategy } from './strategies/select';
import type {
  ArticleStreamEvent,
  ArticleWorkflowInput,
  GeneratedArticle,
} from './strategies/types';

export const ARTICLE_PROMPT_VERSION = 'v9';

// Re-export so existing imports (`@/lib/workflows/article` and
// `@/lib/workflows/article/steps`) continue to work after the
// strategy-pattern refactor moved the canonical definitions.
export type { ArticleStreamEvent, ArticleWorkflowInput, GeneratedArticle };

export async function generateArticleStep(input: ArticleWorkflowInput): Promise<GeneratedArticle> {
  'use step';

  const writable = getWritable<ArticleStreamEvent>();
  const writer = writable.getWriter();

  try {
    const strategy = selectStrategy(input);
    return await strategy.generate(input, { writer });
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

  // The same UPDATE atomically lands the new content AND flips status
  // back to READY, so a concurrent reader never sees the row with
  // status=GENERATING but new content. workflow_id stays at our
  // runId — useful for tracing which run produced the cached row.
  const { workflowRunId } = getWorkflowMetadata();
  const articleData = {
    prompt_version: ARTICLE_PROMPT_VERSION,
    model: DEFAULT_AI_MODEL,
    content: contentForStorage,
    usage: input.usage != null ? JSON.parse(JSON.stringify(input.usage)) : null,
    status: GenerationStatus.READY,
    workflow_id: workflowRunId,
  };

  // The route's claim helper inserts the row before this step ever
  // runs, so the existing row is the steady state. The find is
  // intentionally not status-filtered — we want the GENERATING row
  // we claimed.
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
  // Defensive fallback for the unusual case where the claimed row was
  // removed mid-workflow (manual cleanup, table truncate, etc.).
  // Standard P2002 retry covers concurrent inserts.
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

/**
 * Failure-path step: revert the article row this workflow claimed at
 * start time. See {@link revertArticleRow} for the DELETE-vs-revert
 * decision; this is the workflow-step wrapper so the runtime
 * persists its execution.
 */
export async function revertArticleRowStep(input: ArticleWorkflowInput): Promise<void> {
  'use step';

  const { workflowRunId } = getWorkflowMetadata();
  await revertArticleRow(prisma, input.transcriptId, input.style, input.language, workflowRunId);
}

export async function emitTerminalEventStep(event: ArticleStreamEvent): Promise<void> {
  'use step';
  await emitTerminalEvent(event);
}

// Surfaced so the workflow orchestrator can throw FatalError when a
// strategy reports zero content. (Callers in strategies already throw
// FatalError directly; this re-export simplifies workflows that need
// to construct one without importing from the underlying package.)
export { FatalError };
