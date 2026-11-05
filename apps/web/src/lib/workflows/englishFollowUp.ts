import type { PrismaClient } from '@readtube/database';

import { needsEnglishFollowUp } from '@/lib/language/englishFollowUp';
import type { ClaimResult } from '@/lib/workflows/runRegistry';
import { startBackgroundRun } from '@/lib/workflows/startBackgroundRun';

/**
 * Shared skeleton of the English follow-ups (summary in
 * `summary/englishFollowUp.ts`, article in `article/englishFollowUp.ts`):
 * after a non-English generation starts, queue an English run of the
 * same content so the public share page (English by default) has
 * English content for search engines to index.
 *
 * Each caller passes the input of the run it just started, so the
 * follow-up never re-reads the transcript, plus three table-specific
 * hooks:
 *   - `isCovered`: an English run is already generating, or a complete
 *     English row exists or can be cloned from an Original that is
 *     already English (the same cache the POST routes use).
 *   - `start` / `claim`: start the English workflow and claim its slot.
 *
 * Skipped when the started run is already English (an explicit `en`
 * target, or an Original whose source language is English or unknown;
 * see {@link needsEnglishFollowUp}). Idempotent: a repeat call finds the
 * English slot covered. The English run writes no UserRequest (the user
 * didn't ask for it, so it stays out of their usage counts) and never
 * chains further since its target is English.
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
    isCovered: () => Promise<boolean>;
    start: () => Promise<{ runId: string }>;
    claim: (runId: string) => Promise<ClaimResult>;
  }
): Promise<void> {
  const { logTag, transcriptId, language, sourceLanguage } = params;
  if (!needsEnglishFollowUp(language, language == null ? sourceLanguage : null)) {
    return;
  }
  try {
    if (await params.isCovered()) {
      return;
    }
    const runId = await startBackgroundRun(prisma, {
      logPrefix: `${logTag} transcript ${transcriptId}:`,
      userRequest: null,
      start: params.start,
      claim: params.claim,
    });
    if (runId != null) {
      console.info(`${logTag} Started English run ${runId} for transcript ${transcriptId}`);
    }
  } catch (err) {
    console.error(`${logTag} English follow-up failed for transcript ${transcriptId}:`, err);
  }
}
