import { GenerationStatus, type PrismaClient, UserRequestOutcome } from '@readtube/database';
import { start } from 'workflow/api';

import { DEFAULT_AI_MODEL } from '@/constants';
import { resolveTranscriptLanguage } from '@/lib/language/cache';
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

/**
 * Start a full summary generation for a transcript without a user
 * request in flight. Two callers: the automatic follow-up after the
 * transcript-generation workflow lands a transcript (so the user who
 * clicked "Generate transcript" comes back to a summary, not another
 * button), and the English follow-up queued after a non-English
 * summary lands (see `queueEnglishSummaryStep`).
 *
 * A trimmed-down mirror of the summary POST route's full-generate
 * path with the same registry semantics (dedup via
 * findActiveSummaryRun, claim with cancel-on-lost-race, pending
 * UserRequest for cost attribution). Skipped silently when a READY
 * summary already exists for the slot or another run owns it. The
 * target language defaults to the user's default, exactly what the
 * Generate button would use; the English follow-up passes `en`.
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
  }
): Promise<void> {
  const { userId, videoDbId, transcriptId } = params;
  const target =
    params.language !== undefined
      ? params.language
      : await resolveTargetLanguage(prisma, userId, null);

  // Dedup and cache guards, mirroring the route's full-generate path.
  const activeRun = await findActiveSummaryRun(prisma, transcriptId, target);
  if (activeRun != null) {
    return;
  }
  const existing = await prisma.summary.findFirst({
    where: { transcript_id: transcriptId, language: target, status: GenerationStatus.READY },
    select: { id: true },
  });
  if (existing != null) {
    return;
  }

  const transcript = await prisma.transcript.findUnique({
    where: { id: transcriptId },
    select: {
      text: true,
      video: { select: { title: true, channel: { select: { name: true } } } },
    },
  });
  if (transcript == null) {
    return;
  }
  const segments = JSON.parse(transcript.text) as TranscriptSegmentShape[];
  const transcriptText = segments.map((s) => s.text).join(' ');

  const sourceLanguage =
    target == null ? await resolveTranscriptLanguage(prisma, transcriptId) : null;

  // Pending audit row for cost attribution, backfilled by the summary
  // workflow's persist/revert steps. Best-effort like the route's
  // recordSafe — a failed audit write must not block the generation.
  let userRequest: { id: string } | null = null;
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
          englishFollowUp: { userId, videoDbId },
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
    return;
  }
  console.info(
    `[startAutoSummary] Started summary run ${runId} (language ${target ?? 'original'}) for transcript ${transcriptId}`
  );
}
