import type { PrismaClient } from '@readtube/database';

import { ENGLISH_LANGUAGE_CODE } from '@/lib/language/names';
import { startEnglishFollowUp } from '@/lib/workflows/englishFollowUp';
import {
  type FullSummaryRunInput,
  claimFullSummaryRun,
  isSummarySlotCovered,
  startFullSummaryWorkflow,
} from '@/lib/workflows/summary/fullRun';

/**
 * Queue an English summary next to a just-started non-English one. See
 * {@link startEnglishFollowUp} for when it is skipped. `input` is the
 * started run's input; the English run reuses its transcript text,
 * title, and channel.
 */
export function startEnglishSummaryFollowUp(
  prisma: PrismaClient,
  input: FullSummaryRunInput
): Promise<void> {
  // Explicit targets force translation and don't use the source
  // language (see buildSummaryPrompt).
  const english: FullSummaryRunInput = {
    ...input,
    language: ENGLISH_LANGUAGE_CODE,
    sourceLanguage: null,
  };
  return startEnglishFollowUp(prisma, {
    logTag: '[startEnglishSummaryFollowUp]',
    transcriptId: input.transcriptId,
    language: input.language,
    sourceLanguage: input.sourceLanguage,
    isCovered: () => isSummarySlotCovered(prisma, english.transcriptId, english.language),
    start: () => startFullSummaryWorkflow(english, null),
    claim: (runId) => claimFullSummaryRun(prisma, english, runId),
  });
}
