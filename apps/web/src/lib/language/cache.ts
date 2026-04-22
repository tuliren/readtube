import type { Article, ArticleStyle, Summary } from '@readtube/database';
import { Prisma, prisma } from '@readtube/database';

import { detectLanguage } from './detect';

function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
}

/**
 * Look up a cached Summary for `(transcript_id, language=target)`. When
 * the row doesn't exist but an Original (`language IS NULL`) one does,
 * detect Original's language and either promote it to `target` (single
 * UPDATE, no new row) or stamp Original with the detected code so future
 * requests skip detection. Returns null when no row matches and the
 * caller should generate fresh content.
 *
 * Race-safe: a concurrent writer that takes the partial unique slot for
 * `(transcript_id, target)` will trigger P2002 on our promote UPDATE; we
 * recover by re-reading the just-created target row.
 */
export async function findOrPromoteSummary(
  transcriptId: string,
  target: string | null
): Promise<Summary | null> {
  if (target === null) {
    return prisma.summary.findFirst({
      where: { transcript_id: transcriptId, language: null },
    });
  }

  const direct = await prisma.summary.findFirst({
    where: { transcript_id: transcriptId, language: target },
  });
  if (direct != null) {
    return direct;
  }

  const original = await prisma.summary.findFirst({
    where: { transcript_id: transcriptId, language: null },
  });
  if (original == null) {
    return null;
  }

  // Prefer the longest body for detection; franc gets steadily more
  // accurate with more text. Fall back to the shorter fields if the
  // longer ones are absent.
  const detectionText = original.full ?? original.short ?? original.headline ?? '';
  if (detectionText.trim().length === 0) {
    return null;
  }
  const detected = detectLanguage(detectionText);
  if (detected == null) {
    return null;
  }

  if (detected === target) {
    try {
      return await prisma.summary.update({
        where: { id: original.id },
        data: { language: target },
      });
    } catch (err) {
      if (isUniqueViolation(err)) {
        return prisma.summary.findFirst({
          where: { transcript_id: transcriptId, language: target },
        });
      }
      throw err;
    }
  }

  // Stamp Original with its actual language so the next request for any
  // target skips detection. Best-effort — a concurrent writer racing on
  // the same Original is fine to lose to.
  try {
    await prisma.summary.update({
      where: { id: original.id },
      data: { language: detected },
    });
  } catch {
    // Ignore: race or unique-violation against an unexpected target row.
  }
  return null;
}

/**
 * Article variant of {@link findOrPromoteSummary}. Same semantics; the
 * uniqueness key includes `style`.
 */
export async function findOrPromoteArticle(
  transcriptId: string,
  style: ArticleStyle,
  target: string | null
): Promise<Article | null> {
  if (target === null) {
    return prisma.article.findFirst({
      where: { transcript_id: transcriptId, style, language: null },
    });
  }

  const direct = await prisma.article.findFirst({
    where: { transcript_id: transcriptId, style, language: target },
  });
  if (direct != null) {
    return direct;
  }

  const original = await prisma.article.findFirst({
    where: { transcript_id: transcriptId, style, language: null },
  });
  if (original == null) {
    return null;
  }

  if (original.content.trim().length === 0) {
    return null;
  }
  const detected = detectLanguage(original.content);
  if (detected == null) {
    return null;
  }

  if (detected === target) {
    try {
      return await prisma.article.update({
        where: { id: original.id },
        data: { language: target },
      });
    } catch (err) {
      if (isUniqueViolation(err)) {
        return prisma.article.findFirst({
          where: { transcript_id: transcriptId, style, language: target },
        });
      }
      throw err;
    }
  }

  try {
    await prisma.article.update({
      where: { id: original.id },
      data: { language: detected },
    });
  } catch {
    // Ignore.
  }
  return null;
}
