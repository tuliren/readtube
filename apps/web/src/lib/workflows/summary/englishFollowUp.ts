import { type PrismaClient, prisma } from '@readtube/database';

import { resolveTranscriptLanguage } from '@/lib/language/cache';
import { needsEnglishFollowUp } from '@/lib/language/englishFollowUp';
import { ENGLISH_LANGUAGE_CODE } from '@/lib/language/names';
import { startAutoSummary } from '@/lib/workflows/summary/autoStart';
import type { SummaryWorkflowInput } from '@/lib/workflows/summary/steps';

/**
 * After a non-English summary lands, start a full English summary
 * for the same transcript so the public share page (English by
 * default) has English content to index. Skipped when the input
 * carries no follow-up attribution (per-field regen), when the row
 * just written is already English, or — via `startAutoSummary`'s
 * guards — when an English row is READY or already generating.
 * The English run itself never chains further: its target is English.
 */
export async function startEnglishSummaryFollowUp(
  prisma: PrismaClient,
  input: Pick<SummaryWorkflowInput, 'transcriptId' | 'language' | 'englishFollowUp'>
): Promise<void> {
  const followUp = input.englishFollowUp;
  if (followUp == null) {
    return;
  }
  const sourceLanguage =
    input.language == null ? await resolveTranscriptLanguage(prisma, input.transcriptId) : null;
  if (!needsEnglishFollowUp(input.language, sourceLanguage)) {
    return;
  }
  await startAutoSummary(prisma, {
    userId: followUp.userId,
    videoDbId: followUp.videoDbId,
    transcriptId: input.transcriptId,
    language: ENGLISH_LANGUAGE_CODE,
  });
}

/**
 * Workflow-step wrapper for {@link startEnglishSummaryFollowUp}. Runs
 * after the terminal `done` event, so the requesting client's stream
 * is already closed. Errors are swallowed: the summary the user asked
 * for is persisted, and a missing English sibling only costs SEO.
 */
export async function queueEnglishSummaryStep(input: SummaryWorkflowInput): Promise<void> {
  'use step';

  try {
    await startEnglishSummaryFollowUp(prisma, input);
  } catch (err) {
    console.error(
      `[queueEnglishSummaryStep] English follow-up failed for transcript ${input.transcriptId}:`,
      err
    );
  }
}
