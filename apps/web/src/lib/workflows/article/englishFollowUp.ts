import type { PrismaClient } from '@readtube/database';
import { start } from 'workflow/api';

import type { EnglishFollowUpSlot } from '@/lib/language/englishFollowUp';
import { articleWorkflow } from '@/lib/workflows/article';
import { claimArticleSlot, isArticleSlotCovered } from '@/lib/workflows/article/slot';
import type { ArticleWorkflowInput } from '@/lib/workflows/article/strategies/types';
import { startEnglishFollowUp } from '@/lib/workflows/englishFollowUp';

/**
 * Queue an English article in the same style next to a just-started
 * non-English one. See {@link startEnglishFollowUp} for the slot and
 * when it is skipped. `input` is the started run's input; the English
 * run reuses its segments, title, and duration.
 */
export function startEnglishArticleFollowUp(
  prisma: PrismaClient,
  input: ArticleWorkflowInput
): Promise<void> {
  const forSlot = (slot: EnglishFollowUpSlot): ArticleWorkflowInput => ({
    ...input,
    ...slot,
    userRequestId: null,
  });
  return startEnglishFollowUp(prisma, {
    logTag: '[startEnglishArticleFollowUp]',
    transcriptId: input.transcriptId,
    language: input.language,
    sourceLanguage: input.sourceLanguage,
    isCovered: (language) =>
      isArticleSlotCovered(prisma, input.transcriptId, input.style, language),
    start: (slot) => start(articleWorkflow, [forSlot(slot)]),
    claim: (slot, runId) => claimArticleSlot(prisma, forSlot(slot), runId),
  });
}
