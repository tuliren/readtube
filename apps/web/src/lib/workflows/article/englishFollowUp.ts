import { type PrismaClient } from '@readtube/database';
import { start } from 'workflow/api';

import { DEFAULT_AI_MODEL } from '@/constants';
import { findOrCloneArticle } from '@/lib/language/cache';
import { needsEnglishFollowUp } from '@/lib/language/englishFollowUp';
import { ENGLISH_LANGUAGE_CODE } from '@/lib/language/names';
import { articleWorkflow } from '@/lib/workflows/article';
import { ARTICLE_PROMPT_VERSION } from '@/lib/workflows/article/steps';
import type { ArticleWorkflowInput } from '@/lib/workflows/article/strategies/types';
import { claimArticleRun, findActiveArticleRun } from '@/lib/workflows/runRegistry';
import { startBackgroundRun } from '@/lib/workflows/startBackgroundRun';

/**
 * Queue an English article in the same style alongside a just-started
 * non-English one so the public share page (English by default) has
 * English content for search engines to index. Runs in parallel with
 * the original run and reuses its input (segments, title, duration,
 * detected source language), so no transcript re-read is needed.
 *
 * Skipped when the started run is already English (an explicit `en`
 * target, or an Original whose source language is English or unknown
 * — see {@link needsEnglishFollowUp}), or when an English article for
 * the style is already generating, READY with content, or can be
 * cloned from an Original already in English (findOrCloneArticle,
 * same cache the article POST uses).
 *
 * The run writes no UserRequest: the user didn't ask for it, so it
 * stays out of their usage counts.
 *
 * Best-effort: errors are logged, never thrown, because the content
 * the user asked for is unaffected by a missing English sibling.
 */
export async function startEnglishArticleFollowUp(
  prisma: PrismaClient,
  input: ArticleWorkflowInput
): Promise<void> {
  if (!needsEnglishFollowUp(input.language, input.language == null ? input.sourceLanguage : null)) {
    return;
  }
  try {
    await startEnglishArticle(prisma, input);
  } catch (err) {
    console.error(
      `[startEnglishArticleFollowUp] English follow-up failed for transcript ${input.transcriptId}:`,
      err
    );
  }
}

async function startEnglishArticle(
  prisma: PrismaClient,
  input: ArticleWorkflowInput
): Promise<void> {
  const { transcriptId, style } = input;
  const target = ENGLISH_LANGUAGE_CODE;
  const activeRun = await findActiveArticleRun(prisma, transcriptId, style, target);
  if (activeRun != null) {
    return;
  }
  const cached = await findOrCloneArticle(prisma, transcriptId, style, target);
  if (cached?.content != null) {
    return;
  }

  const runId = await startBackgroundRun(prisma, {
    logPrefix: `[startEnglishArticleFollowUp] transcript ${transcriptId}:`,
    userRequest: null,
    start: () =>
      start(articleWorkflow, [
        {
          ...input,
          language: target,
          // Explicit target requests force translation and don't use
          // the source language (see ArticleWorkflowInput).
          sourceLanguage: null,
          userRequestId: null,
        },
      ]),
    claim: (newRunId) =>
      claimArticleRun(
        prisma,
        transcriptId,
        style,
        target,
        newRunId,
        ARTICLE_PROMPT_VERSION,
        DEFAULT_AI_MODEL
      ),
  });
  if (runId != null) {
    console.info(
      `[startEnglishArticleFollowUp] Started article run ${runId} for transcript ${transcriptId} (style=${style})`
    );
  }
}
