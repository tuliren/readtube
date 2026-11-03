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
 * Queue an English article in the same style alongside a just-started
 * non-English one so the public share page (English by default) has
 * English content for search engines to index. Runs in parallel with
 * the original run and reuses its input (segments, title, duration),
 * so no transcript re-read is needed.
 *
 * Skipped when the started run is already English (an explicit `en`
 * target, or an Original whose source language is English or unknown
 * — see {@link needsEnglishFollowUp}), or when an English row for the
 * style is READY or already generating.
 *
 * Best-effort: errors are logged, never thrown, because the content
 * the user asked for is unaffected by a missing English sibling.
 */
export async function startEnglishArticleFollowUp(
  prisma: PrismaClient,
  params: { userId: string; videoDbId: string; input: ArticleWorkflowInput }
): Promise<void> {
  try {
    await startEnglishArticle(prisma, params);
  } catch (err) {
    console.error(
      `[startEnglishArticleFollowUp] English follow-up failed for transcript ${params.input.transcriptId}:`,
      err
    );
  }
}

async function startEnglishArticle(
  prisma: PrismaClient,
  params: { userId: string; videoDbId: string; input: ArticleWorkflowInput }
): Promise<void> {
  const { userId, videoDbId, input } = params;
  const sourceLanguage =
    input.language == null
      ? (input.sourceLanguage ?? (await resolveTranscriptLanguage(prisma, input.transcriptId)))
      : null;
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
      userId,
      videoId: videoDbId,
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
