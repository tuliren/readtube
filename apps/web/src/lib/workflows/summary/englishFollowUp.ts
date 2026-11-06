import type { PrismaClient } from '@readtube/database';

import type { EnglishFollowUpSlot } from '@/lib/language/englishFollowUp';
import { startEnglishFollowUp } from '@/lib/workflows/englishFollowUp';
import {
  type FullSummaryRunInput,
  claimFullSummaryRun,
  isSummarySlotCovered,
  startFullSummaryWorkflow,
} from '@/lib/workflows/summary/fullRun';

/**
 * Queue an English summary next to a just-started non-English one. See
 * {@link startEnglishFollowUp} for the slot and when it is skipped.
 * `input` is the started run's input; the English run reuses its
 * transcript text, title, and channel.
 */
export function startEnglishSummaryFollowUp(
  prisma: PrismaClient,
  input: FullSummaryRunInput
): Promise<void> {
  const forSlot = (slot: EnglishFollowUpSlot): FullSummaryRunInput => ({ ...input, ...slot });
  return startEnglishFollowUp(prisma, {
    logTag: '[startEnglishSummaryFollowUp]',
    transcriptId: input.transcriptId,
    language: input.language,
    sourceLanguage: input.sourceLanguage,
    isCovered: (language) => isSummarySlotCovered(prisma, input.transcriptId, language),
    start: (slot) => startFullSummaryWorkflow(forSlot(slot), null),
    claim: (slot, runId) => claimFullSummaryRun(prisma, forSlot(slot), runId),
  });
}
