import type { PrismaClient } from '@readtube/database';
import { start } from 'workflow/api';

import { DEFAULT_AI_MODEL } from '@/constants';
import { findOrCloneArticle } from '@/lib/language/cache';
import { ENGLISH_LANGUAGE_CODE } from '@/lib/language/names';
import { articleWorkflow } from '@/lib/workflows/article';
import { ARTICLE_PROMPT_VERSION } from '@/lib/workflows/article/steps';
import type { ArticleWorkflowInput } from '@/lib/workflows/article/strategies/types';
import { startEnglishFollowUp } from '@/lib/workflows/englishFollowUp';
import { claimArticleRun, findActiveArticleRun } from '@/lib/workflows/runRegistry';

/**
 * Queue an English article in the same style next to a just-started
 * non-English one. See {@link startEnglishFollowUp} for when it is
 * skipped. `input` is the started run's input; the English run reuses
 * its segments, title, and duration.
 */
export function startEnglishArticleFollowUp(
  prisma: PrismaClient,
  input: ArticleWorkflowInput
): Promise<void> {
  const english: ArticleWorkflowInput = {
    ...input,
    language: ENGLISH_LANGUAGE_CODE,
    // Explicit targets force translation and don't use the source
    // language (see ArticleWorkflowInput).
    sourceLanguage: null,
    userRequestId: null,
  };
  const { transcriptId, style } = english;
  return startEnglishFollowUp(prisma, {
    logTag: '[startEnglishArticleFollowUp]',
    transcriptId,
    language: input.language,
    sourceLanguage: input.sourceLanguage,
    isCovered: async () => {
      if ((await findActiveArticleRun(prisma, transcriptId, style, english.language)) != null) {
        return true;
      }
      const cached = await findOrCloneArticle(prisma, transcriptId, style, english.language);
      return cached?.content != null;
    },
    start: () => start(articleWorkflow, [english]),
    claim: (runId) =>
      claimArticleRun(
        prisma,
        transcriptId,
        style,
        english.language,
        runId,
        ARTICLE_PROMPT_VERSION,
        DEFAULT_AI_MODEL
      ),
  });
}
