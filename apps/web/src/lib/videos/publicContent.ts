import { ArticleStyle, type PrismaClient } from '@readtube/database';

import { resolveShareRow } from '@/lib/language/publicShare';
import { COMPLETE_SUMMARY_WHERE, isCompleteSummary } from '@/lib/workflows/summary/completeness';

/** Article style the public reader shows. */
export const PUBLIC_ARTICLE_STYLE: ArticleStyle = ArticleStyle.NARRATIVE;

/**
 * Latest transcript of a video, plus whether it carries any READY
 * summary or article. That is the public-sharing gate: the public page
 * (`/p/videos/[videoId]`), the public summary/article APIs, and the
 * markdown rendition all 404 a video without either artifact, even when
 * its id is guessed correctly.
 *
 * Gates on ANY READY summary or article, not on `language IS NULL`:
 * translations don't always derive from a pre-existing Original (the
 * user can pick a target language as their first generation), so a
 * missing Original isn't the same thing as "no public artifact".
 */
export async function findPublicTranscript(
  prisma: PrismaClient,
  videoId: string
): Promise<{ videoExists: boolean; transcriptId: string | null }> {
  const video = await prisma.video.findFirst({
    where: { id: videoId },
    select: {
      id: true,
      transcripts: {
        orderBy: { created_at: 'desc' },
        take: 1,
        select: {
          id: true,
          summaries: { where: { status: 'READY' }, take: 1, select: { transcript_id: true } },
          articles: { where: { status: 'READY' }, take: 1, select: { id: true } },
        },
      },
    },
  });
  if (video == null) {
    return { videoExists: false, transcriptId: null };
  }
  const transcript = video.transcripts[0];
  const hasAnyPublicArtifact =
    transcript != null && (transcript.summaries.length > 0 || transcript.articles.length > 0);
  return { videoExists: true, transcriptId: hasAnyPublicArtifact ? transcript.id : null };
}

/**
 * The summary a public visitor sees for `requested` (see
 * `parseShareLanguage`), resolved English-first by `resolveShareRow`.
 * Every lookup filters on `status = READY` so an in-flight row never
 * surfaces, and on complete fields so an incomplete row can't shadow a
 * complete sibling during the fallback.
 */
export async function loadPublicSummary(
  prisma: PrismaClient,
  transcriptId: string,
  requested: string | null | undefined
) {
  const fields = {
    select: { headline: true, short: true, full: true, language: true, generated_at: true },
  } as const;
  const where = {
    transcript_id: transcriptId,
    status: 'READY',
    ...COMPLETE_SUMMARY_WHERE,
  } as const;
  const summary = await resolveShareRow(
    requested,
    (language) => prisma.summary.findFirst({ where: { ...where, language }, ...fields }),
    () => prisma.summary.findFirst({ where, orderBy: { generated_at: 'asc' }, ...fields })
  );
  // The queries already exclude incomplete rows; this narrows the type.
  return isCompleteSummary(summary) ? summary : null;
}

/**
 * The article a public visitor sees for `requested` and `style`,
 * resolved like {@link loadPublicSummary}. Requires `content != null`
 * on every lookup: a READY-with-null-content row isn't servable, so it
 * must not shadow a sibling that does have content.
 */
export async function loadPublicArticle(
  prisma: PrismaClient,
  transcriptId: string,
  requested: string | null | undefined,
  style: ArticleStyle = PUBLIC_ARTICLE_STYLE
) {
  const fields = {
    select: { content: true, style: true, language: true, generated_at: true },
  } as const;
  const where = {
    transcript_id: transcriptId,
    style,
    status: 'READY',
    content: { not: null },
  } as const;
  const article = await resolveShareRow(
    requested,
    (language) => prisma.article.findFirst({ where: { ...where, language }, ...fields }),
    () => prisma.article.findFirst({ where, orderBy: { generated_at: 'asc' }, ...fields })
  );
  // The queries already exclude null content; this narrows the type.
  if (article == null || article.content == null) {
    return null;
  }
  return { ...article, content: article.content };
}
