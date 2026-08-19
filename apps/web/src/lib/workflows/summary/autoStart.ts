import { GenerationStatus, type PrismaClient, UserRequestOutcome } from '@readtube/database';
import { getRun, start } from 'workflow/api';

import { DEFAULT_AI_MODEL } from '@/constants';
import { resolveTranscriptLanguage } from '@/lib/language/cache';
import { resolveTargetLanguage } from '@/lib/language/resolve';
import { recordSummaryRequest } from '@/lib/usage/userRequest';
import { claimSummaryRun, findActiveSummaryRun } from '@/lib/workflows/runRegistry';
import { summaryWorkflow } from '@/lib/workflows/summary';
import { buildSummaryPrompt } from '@/lib/workflows/summary/buildPrompt';
import { SUMMARY_FIELDS, SUMMARY_PROMPT_VERSION } from '@/lib/workflows/summary/steps';

interface TranscriptSegmentShape {
  text: string;
}

/**
 * Start a full summary generation for a transcript without a user
 * request in flight — the automatic follow-up after the transcript-
 * generation workflow lands a transcript, so the user who clicked
 * "Generate transcript" comes back to a summary, not another button.
 *
 * A trimmed-down mirror of the summary POST route's full-generate
 * path with the same registry semantics (dedup via
 * findActiveSummaryRun, claim with cancel-on-lost-race, pending
 * UserRequest for cost attribution). Skipped silently when a READY
 * summary already exists for the slot or another run owns it. The
 * target language is the user's default, exactly what the Generate
 * button would use.
 *
 * Never throws for "nothing to do" cases; callers are expected to
 * treat any thrown error as non-fatal (the transcript is already
 * persisted — a failed auto-summary must not fail its workflow).
 */
export async function startAutoSummary(
  prisma: PrismaClient,
  params: { userId: string; videoDbId: string; transcriptId: string }
): Promise<void> {
  const { userId, videoDbId, transcriptId } = params;
  const target = await resolveTargetLanguage(prisma, userId, null);

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

  const run = await start(summaryWorkflow, [
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
  ]);

  const claim = await claimSummaryRun(
    prisma,
    transcriptId,
    target,
    run.runId,
    SUMMARY_PROMPT_VERSION,
    DEFAULT_AI_MODEL
  );
  if (!claim.weWon) {
    console.info(
      `[startAutoSummary] Lost claim race for transcript ${transcriptId}; cancelling ${run.runId}`
    );
    try {
      await getRun(run.runId).cancel();
    } catch {
      // ignore — the stray run will expire on its own
    }
    if (userRequest != null) {
      try {
        await prisma.userRequest.delete({ where: { id: userRequest.id } });
      } catch (err) {
        console.error('[startAutoSummary] failed to delete claim-race UserRequest:', err);
      }
    }
    return;
  }

  if (userRequest != null) {
    try {
      await prisma.userRequest.update({
        where: { id: userRequest.id },
        data: { workflow_id: run.runId },
      });
    } catch (err) {
      console.error('[startAutoSummary] failed to stamp workflow_id on UserRequest:', err);
    }
  }
  console.info(
    `[startAutoSummary] Started summary run ${run.runId} for transcript ${transcriptId}`
  );
}
