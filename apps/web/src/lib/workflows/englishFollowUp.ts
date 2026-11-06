import type { PrismaClient } from '@readtube/database';

import { resolveTranscriptLanguage } from '@/lib/language/cache';
import {
  type EnglishFollowUpSlot,
  englishFollowUpSlot,
  isEnglish,
} from '@/lib/language/englishFollowUp';
import { ENGLISH_LANGUAGE_CODE } from '@/lib/language/names';
import type { ClaimResult } from '@/lib/workflows/runRegistry';
import { startAndClaimRun } from '@/lib/workflows/startAndClaimRun';

/**
 * Shared skeleton of the English follow-ups (summary in
 * `summary/englishFollowUp.ts`, article in `article/englishFollowUp.ts`):
 * after a non-English generation starts, queue an English run of the
 * same content so the public share page (English by default) has
 * English content for search engines to index.
 *
 * Each caller passes the input of the run it just started, so the
 * follow-up never re-reads the transcript text, plus three
 * table-specific hooks:
 *   - `isCovered(language)`: a run is already generating that slot, or
 *     a complete row exists or can be cloned (the same cache the POST
 *     routes use).
 *   - `start(slot)` / `claim(slot, runId)`: start the workflow for the
 *     slot and claim it.
 *
 * The slot is `en`, or the Original when the source is English (see
 * {@link englishFollowUpSlot}). An English Original and an `en` row
 * both serve the share page's English default, so an Original slot is
 * also covered by a complete `en` row. Skipped when the started run is
 * already English. Idempotent: a repeat call finds the slot covered.
 * The run writes no UserRequest (the user didn't ask for it, so it
 * stays out of their usage counts) and never chains further since its
 * output is English.
 *
 * Best-effort: errors are logged, never thrown, because the content the
 * user asked for is unaffected by a missing English sibling.
 */
export async function startEnglishFollowUp(
  prisma: PrismaClient,
  params: {
    /** Log prefix, e.g. `[startEnglishSummaryFollowUp]`. */
    logTag: string;
    transcriptId: string;
    /** Target of the run just started; null = Original. */
    language: string | null;
    /** Detected source language of an Original run (null when
     *  undetectable); ignored for target runs. */
    sourceLanguage: string | null;
    isCovered: (language: string | null) => Promise<boolean>;
    start: (slot: EnglishFollowUpSlot) => Promise<{ runId: string }>;
    claim: (slot: EnglishFollowUpSlot, runId: string) => Promise<ClaimResult>;
  }
): Promise<void> {
  const { logTag, transcriptId, language } = params;
  // Checked before the try so an English target, the common case,
  // skips resolving the source language.
  if (language != null && isEnglish(language)) {
    return;
  }
  try {
    // A target run's input carries no source language (its prompt
    // ignores it), but the slot choice needs it.
    const sourceLanguage =
      language == null
        ? params.sourceLanguage
        : await resolveTranscriptLanguage(prisma, transcriptId);
    const slot = englishFollowUpSlot(language, sourceLanguage);
    if (slot == null) {
      return;
    }
    const covering = slot.language == null ? [null, ENGLISH_LANGUAGE_CODE] : [slot.language];
    for (const coveringLanguage of covering) {
      if (await params.isCovered(coveringLanguage)) {
        return;
      }
    }
    const claim = await startAndClaimRun(prisma, {
      logPrefix: `${logTag} transcript ${transcriptId}:`,
      userRequest: null,
      start: () => params.start(slot),
      claim: (runId) => params.claim(slot, runId),
    });
    if (claim.weWon) {
      console.info(
        `${logTag} Started English run ${claim.winningRunId} (language ${slot.language ?? 'original'}) for transcript ${transcriptId}`
      );
    }
  } catch (err) {
    console.error(`${logTag} English follow-up failed for transcript ${transcriptId}:`, err);
  }
}
