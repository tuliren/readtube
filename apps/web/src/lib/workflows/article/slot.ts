import type { ArticleStyle, PrismaClient } from '@readtube/database';

import { DEFAULT_AI_MODEL } from '@/constants';
import { findOrCloneArticle } from '@/lib/language/cache';
import { ARTICLE_PROMPT_VERSION } from '@/lib/workflows/article/steps';
import type { ArticleWorkflowInput } from '@/lib/workflows/article/strategies/types';
import {
  type ClaimResult,
  claimArticleRun,
  findActiveArticleRun,
} from '@/lib/workflows/runRegistry';

/** Claim the `(transcript, style, language)` article slot for `runId`. */
export function claimArticleSlot(
  prisma: PrismaClient,
  input: Pick<ArticleWorkflowInput, 'transcriptId' | 'style' | 'language'>,
  runId: string
): Promise<ClaimResult> {
  return claimArticleRun(
    prisma,
    input.transcriptId,
    input.style,
    input.language,
    runId,
    ARTICLE_PROMPT_VERSION,
    DEFAULT_AI_MODEL
  );
}

/**
 * Whether a generation for the slot would be redundant: a run is
 * already active, or a row with content exists (directly, or cloned
 * from an Original already in the target language). Mirrors the
 * article POST's tap-in and cache checks; the summary counterpart is
 * `isSummarySlotCovered`.
 */
export async function isArticleSlotCovered(
  prisma: PrismaClient,
  transcriptId: string,
  style: ArticleStyle,
  language: string | null
): Promise<boolean> {
  if ((await findActiveArticleRun(prisma, transcriptId, style, language)) != null) {
    return true;
  }
  const cached = await findOrCloneArticle(prisma, transcriptId, style, language);
  return cached?.content != null;
}
