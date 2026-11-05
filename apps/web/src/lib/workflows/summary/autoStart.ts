import { type PrismaClient, UserRequestOutcome } from '@readtube/database';
import { start } from 'workflow/api';

import { DEFAULT_AI_MODEL } from '@/constants';
import { findOrCloneSummary, resolveTranscriptLanguage } from '@/lib/language/cache';
import { needsEnglishFollowUp } from '@/lib/language/englishFollowUp';
import { ENGLISH_LANGUAGE_CODE } from '@/lib/language/names';
import { resolveTargetLanguage } from '@/lib/language/resolve';
import { recordSummaryRequest } from '@/lib/usage/userRequest';
import { claimSummaryRun, findActiveSummaryRun } from '@/lib/workflows/runRegistry';
import { startBackgroundRun } from '@/lib/workflows/startBackgroundRun';
import { summaryWorkflow } from '@/lib/workflows/summary';
import { buildSummaryPrompt } from '@/lib/workflows/summary/buildPrompt';
import { SUMMARY_FIELDS, SUMMARY_PROMPT_VERSION } from '@/lib/workflows/summary/steps';

interface TranscriptSegmentShape {
  text: string;
}

/** What `startAutoSummary` started, for chaining the English follow-up. */
export interface StartedAutoSummary {
  /** Target of the started run; null = Original. */
  language: string | null;
  /** Detected source language for an Original run; null otherwise. */
  sourceLanguage: string | null;
}

/**
 * Start a full summary generation for a transcript without a user
 * request in flight. Two callers: the automatic follow-up after the
 * transcript-generation workflow lands a transcript (so the user who
 * clicked "Generate transcript" comes back to a summary, not another
 * button), and the English sibling queued next to a non-English
 * summary (see {@link startEnglishSummaryFollowUp}).
 *
 * A trimmed-down mirror of the summary POST route's full-generate
 * path with the same registry semantics (dedup via
 * findActiveSummaryRun, cache via findOrCloneSummary, claim with
 * cancel-on-lost-race, pending UserRequest for cost attribution).
 * Skipped silently when a READY summary already exists (or can be
 * cloned from an Original already in the target language) or another
 * run owns the slot. The target language defaults to the user's
 * default, exactly what the Generate button would use; the English
 * follow-up passes `en`.
 *
 * Returns what it started, or null when nothing was started. It does
 * not queue the English follow-up itself: the caller does, once any
 * latency-sensitive work is done (see `startSummaryGenerationStep`).
 *
 * Never throws for "nothing to do" cases; callers are expected to
 * treat any thrown error as non-fatal (the transcript is already
 * persisted — a failed auto-summary must not fail its workflow).
 */
export async function startAutoSummary(
  prisma: PrismaClient,
  params: {
    userId: string;
    videoDbId: string;
    transcriptId: string;
    /** Explicit target; omitted → the user's default language. */
    language?: string | null;
    /**
     * Write a pending UserRequest for the run (default true). The
     * English follow-up passes false: the user didn't ask for it, so
     * it must not show up in their usage counts.
     */
    recordUserRequest?: boolean;
  }
): Promise<StartedAutoSummary | null> {
  const { userId, videoDbId, transcriptId, recordUserRequest = true } = params;
  const target =
    params.language !== undefined
      ? params.language
      : await resolveTargetLanguage(prisma, userId, null);

  // Dedup and cache guards, mirroring the route's full-generate path.
  const activeRun = await findActiveSummaryRun(prisma, transcriptId, target);
  if (activeRun != null) {
    return null;
  }
  const cached = await findOrCloneSummary(prisma, transcriptId, target);
  if (cached != null && cached.headline != null && cached.short != null && cached.full != null) {
    return null;
  }

  const transcript = await prisma.transcript.findUnique({
    where: { id: transcriptId },
    select: {
      text: true,
      video: { select: { title: true, channel: { select: { name: true } } } },
    },
  });
  if (transcript == null) {
    return null;
  }
  const segments = JSON.parse(transcript.text) as TranscriptSegmentShape[];
  const transcriptText = segments.map((s) => s.text).join(' ');

  const sourceLanguage =
    target == null ? await resolveTranscriptLanguage(prisma, transcriptId) : null;

  // Pending audit row for cost attribution, backfilled by the summary
  // workflow's persist/revert steps. Best-effort like the route's
  // recordSafe — a failed audit write must not block the generation.
  let userRequest: { id: string } | null = null;
  if (recordUserRequest) {
    try {
      userRequest = await recordSummaryRequest(prisma, {
        userId,
        videoId: videoDbId,
        outcome: UserRequestOutcome.GENERATED,
        language: target,
        model: DEFAULT_AI_MODEL,
        promptVersion: SUMMARY_PROMPT_VERSION,
      });
    } catch (err) {
      console.error('[startAutoSummary] failed to record UserRequest:', err);
    }
  }

  const runId = await startBackgroundRun(prisma, {
    logPrefix: `[startAutoSummary] transcript ${transcriptId}:`,
    userRequest,
    start: () =>
      start(summaryWorkflow, [
        {
          fieldsToGenerate: [...SUMMARY_FIELDS],
          prompt: buildSummaryPrompt(
            SUMMARY_FIELDS,
            target,
            sourceLanguage,
            transcript.video.title,
            transcript.video.channel.name,
            transcriptText,
            undefined
          ),
          transcriptId,
          language: target,
          userRequestId: userRequest?.id ?? null,
        },
      ]),
    claim: (newRunId) =>
      claimSummaryRun(
        prisma,
        transcriptId,
        target,
        newRunId,
        SUMMARY_PROMPT_VERSION,
        DEFAULT_AI_MODEL
      ),
  });
  if (runId == null) {
    return null;
  }
  console.info(
    `[startAutoSummary] Started summary run ${runId} (language ${target ?? 'original'}) for transcript ${transcriptId}`
  );
  return { language: target, sourceLanguage };
}

/**
 * Queue an English summary alongside a just-started non-English one so
 * the public share page (English by default) has English content for
 * search engines to index. Runs in parallel with the original run.
 *
 * Skipped when the started run is already English (an explicit `en`
 * target, or an Original whose source language is English or unknown
 * — see {@link needsEnglishFollowUp}), and, via `startAutoSummary`'s
 * guards, when an English row is READY, can be cloned from an English
 * Original, or is already generating. The English run never chains
 * further since its target is English.
 *
 * The run writes no UserRequest: the user didn't ask for it, so it
 * stays out of their usage counts.
 *
 * Best-effort: errors are logged, never thrown, because the content
 * the user asked for is unaffected by a missing English sibling.
 */
export async function startEnglishSummaryFollowUp(
  prisma: PrismaClient,
  params: {
    userId: string;
    videoDbId: string;
    transcriptId: string;
    /** Target of the run just started; null = Original. */
    language: string | null;
    /**
     * Detected source language of an Original run (null when
     * undetectable); ignored for target runs.
     */
    sourceLanguage: string | null;
  }
): Promise<void> {
  const { userId, videoDbId, transcriptId, language, sourceLanguage } = params;
  if (!needsEnglishFollowUp(language, language == null ? sourceLanguage : null)) {
    return;
  }
  try {
    await startAutoSummary(prisma, {
      userId,
      videoDbId,
      transcriptId,
      language: ENGLISH_LANGUAGE_CODE,
      recordUserRequest: false,
    });
  } catch (err) {
    console.error(
      `[startEnglishSummaryFollowUp] English follow-up failed for transcript ${transcriptId}:`,
      err
    );
  }
}
