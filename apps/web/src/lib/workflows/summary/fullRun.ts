import type { PrismaClient } from '@readtube/database';
import { start } from 'workflow/api';

import { DEFAULT_AI_MODEL } from '@/constants';
import { findOrCloneSummary } from '@/lib/language/cache';
import {
  type ClaimResult,
  claimSummaryRun,
  findActiveSummaryRun,
} from '@/lib/workflows/runRegistry';
import { summaryWorkflow } from '@/lib/workflows/summary';
import { buildSummaryPrompt } from '@/lib/workflows/summary/buildPrompt';
import { isCompleteSummary } from '@/lib/workflows/summary/completeness';
import { SUMMARY_FIELDS, SUMMARY_PROMPT_VERSION } from '@/lib/workflows/summary/steps';

/**
 * Everything a full (all-fields) summary run needs, the summary
 * counterpart of `ArticleWorkflowInput`. Built once by whoever already
 * holds the transcript (the summary POST, `startAutoSummary`) and
 * handed to the English follow-up so it never re-reads the transcript.
 */
export interface FullSummaryRunInput {
  transcriptId: string;
  /** Target language; null = Original. */
  language: string | null;
  /** Detected source language for an Original run; null otherwise or
   *  when undetectable. */
  sourceLanguage: string | null;
  transcriptText: string;
  videoTitle: string;
  channelName: string;
}

/** Start the summary workflow for every field. */
export function startFullSummaryWorkflow(
  input: FullSummaryRunInput,
  userRequestId: string | null
): Promise<{ runId: string }> {
  return start(summaryWorkflow, [
    {
      fieldsToGenerate: [...SUMMARY_FIELDS],
      prompt: buildSummaryPrompt(
        SUMMARY_FIELDS,
        input.language,
        input.sourceLanguage,
        input.videoTitle,
        input.channelName,
        input.transcriptText,
        undefined
      ),
      transcriptId: input.transcriptId,
      language: input.language,
      userRequestId,
    },
  ]);
}

/** Claim the `(transcript, language)` summary slot for `runId`. */
export function claimFullSummaryRun(
  prisma: PrismaClient,
  input: FullSummaryRunInput,
  runId: string
): Promise<ClaimResult> {
  return claimSummaryRun(
    prisma,
    input.transcriptId,
    input.language,
    runId,
    SUMMARY_PROMPT_VERSION,
    DEFAULT_AI_MODEL
  );
}

/**
 * Whether a full generation for the slot would be redundant: a run is
 * already active, or a complete row exists (directly, or cloned from an
 * Original already in the target language). Mirrors the summary POST's
 * tap-in and cache checks.
 */
export async function isSummarySlotCovered(
  prisma: PrismaClient,
  transcriptId: string,
  language: string | null
): Promise<boolean> {
  if ((await findActiveSummaryRun(prisma, transcriptId, language)) != null) {
    return true;
  }
  return isCompleteSummary(await findOrCloneSummary(prisma, transcriptId, language));
}
