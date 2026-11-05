import { type PrismaClient, UserRequestOutcome } from '@readtube/database';

import { DEFAULT_AI_MODEL } from '@/constants';
import { resolveTranscriptLanguage } from '@/lib/language/cache';
import { resolveTargetLanguage } from '@/lib/language/resolve';
import { recordSummaryRequest } from '@/lib/usage/userRequest';
import { startAndClaimRun } from '@/lib/workflows/startAndClaimRun';
import {
  type FullSummaryRunInput,
  claimFullSummaryRun,
  isSummarySlotCovered,
  startFullSummaryWorkflow,
} from '@/lib/workflows/summary/fullRun';
import { SUMMARY_PROMPT_VERSION } from '@/lib/workflows/summary/steps';

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
 * path with the same registry semantics (dedup and cache via
 * isSummarySlotCovered, claim with cancel-on-lost-race, pending
 * UserRequest for cost attribution). Skipped silently when the slot
 * is already covered. The target language is the user's default,
 * exactly what the Generate button would use.
 *
 * Returns the slot's run input whether or not this call started the
 * run (null only when the transcript is gone), so the caller can queue
 * the English follow-up even on a retry that finds its own earlier run
 * active. The follow-up is idempotent, so a repeat queue is harmless.
 *
 * Never throws for "nothing to do" cases; callers are expected to
 * treat any thrown error as non-fatal (the transcript is already
 * persisted — a failed auto-summary must not fail its workflow).
 */
export async function startAutoSummary(
  prisma: PrismaClient,
  params: { userId: string; videoDbId: string; transcriptId: string }
): Promise<FullSummaryRunInput | null> {
  const { userId, videoDbId, transcriptId } = params;
  const target = await resolveTargetLanguage(prisma, userId, null);

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
  const input: FullSummaryRunInput = {
    transcriptId,
    language: target,
    sourceLanguage: target == null ? await resolveTranscriptLanguage(prisma, transcriptId) : null,
    transcriptText: segments.map((s) => s.text).join(' '),
    videoTitle: transcript.video.title,
    channelName: transcript.video.channel.name,
  };

  if (await isSummarySlotCovered(prisma, transcriptId, target)) {
    return input;
  }

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

  const claim = await startAndClaimRun(prisma, {
    logPrefix: `[startAutoSummary] transcript ${transcriptId}:`,
    userRequest,
    start: () => startFullSummaryWorkflow(input, userRequest?.id ?? null),
    claim: (newRunId) => claimFullSummaryRun(prisma, input, newRunId),
  });
  if (claim.weWon) {
    console.info(
      `[startAutoSummary] Started summary run ${claim.winningRunId} (language ${target ?? 'original'}) for transcript ${transcriptId}`
    );
  }
  return input;
}
