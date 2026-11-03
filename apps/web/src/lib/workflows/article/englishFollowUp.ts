import {
  GenerationStatus,
  type PrismaClient,
  UserRequestOutcome,
  prisma,
} from '@readtube/database';
import { start } from 'workflow/api';

import { DEFAULT_AI_MODEL } from '@/constants';
import { resolveTranscriptLanguage } from '@/lib/language/cache';
import { needsEnglishFollowUp } from '@/lib/language/englishFollowUp';
import { ENGLISH_LANGUAGE_CODE } from '@/lib/language/names';
import { recordArticleRequest } from '@/lib/usage/userRequest';
import { articleWorkflow } from '@/lib/workflows/article';
import { ARTICLE_PROMPT_VERSION } from '@/lib/workflows/article/steps';
import type { ArticleWorkflowInput } from '@/lib/workflows/article/strategies/types';
import { claimArticleRun, findActiveArticleRun } from '@/lib/workflows/runRegistry';
import { startBackgroundRun } from '@/lib/workflows/startBackgroundRun';

/**
 * After a non-English article lands, start an English article in the
 * same style for the same transcript so the public share page
 * (English by default) has English content to index. Reuses the
 * finished run's input (segments, title, duration) so no transcript
 * re-read is needed. Skipped when the input carries no follow-up
 * attribution (force regen), when the row just written is already
 * English, or when an English row for the style is READY or already
 * generating. The English run itself never chains further: its target
 * is English.
 */
export async function startEnglishArticleFollowUp(
  prisma: PrismaClient,
  input: ArticleWorkflowInput
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

  const { transcriptId, style } = input;
  const target = ENGLISH_LANGUAGE_CODE;
  const activeRun = await findActiveArticleRun(prisma, transcriptId, style, target);
  if (activeRun != null) {
    return;
  }
  const existing = await prisma.article.findFirst({
    where: { transcript_id: transcriptId, style, language: target, status: GenerationStatus.READY },
    select: { id: true },
  });
  if (existing != null) {
    return;
  }

  // Pending audit row for cost attribution, backfilled by the article
  // workflow's persist/revert steps. Best-effort like the route's
  // recordSafe.
  let userRequest: { id: string } | null = null;
  try {
    userRequest = await recordArticleRequest(prisma, {
      userId: followUp.userId,
      videoId: followUp.videoDbId,
      outcome: UserRequestOutcome.GENERATED,
      language: target,
      style,
      model: DEFAULT_AI_MODEL,
      promptVersion: ARTICLE_PROMPT_VERSION,
    });
  } catch (err) {
    console.error('[startEnglishArticleFollowUp] failed to record UserRequest:', err);
  }

  const runId = await startBackgroundRun(prisma, {
    logPrefix: `[startEnglishArticleFollowUp] transcript ${transcriptId}:`,
    userRequest,
    start: () =>
      start(articleWorkflow, [
        {
          ...input,
          language: target,
          // Explicit target requests force translation and don't use
          // the source language (see ArticleWorkflowInput).
          sourceLanguage: null,
          userRequestId: userRequest?.id ?? null,
          englishFollowUp: followUp,
        },
      ]),
    claim: (newRunId) =>
      claimArticleRun(
        prisma,
        transcriptId,
        style,
        target,
        newRunId,
        ARTICLE_PROMPT_VERSION,
        DEFAULT_AI_MODEL
      ),
  });
  if (runId != null) {
    console.info(
      `[startEnglishArticleFollowUp] Started article run ${runId} for transcript ${transcriptId} (style=${style})`
    );
  }
}

/**
 * Workflow-step wrapper for {@link startEnglishArticleFollowUp}. Runs
 * after the terminal `done` event, so the requesting client's stream
 * is already closed. Errors are swallowed: the article the user asked
 * for is persisted, and a missing English sibling only costs SEO.
 */
export async function queueEnglishArticleStep(input: ArticleWorkflowInput): Promise<void> {
  'use step';

  try {
    await startEnglishArticleFollowUp(prisma, input);
  } catch (err) {
    console.error(
      `[queueEnglishArticleStep] English follow-up failed for transcript ${input.transcriptId}:`,
      err
    );
  }
}
