import { ArticleStyle, type Prisma, type PrismaClient } from '@readtube/database';

import { resolveShareRow } from '@/lib/language/publicShare';
import { COMPLETE_SUMMARY_WHERE, isCompleteSummary } from '@/lib/workflows/summary/completeness';

/** Article style the public reader shows. */
export const PUBLIC_ARTICLE_STYLE: ArticleStyle = ArticleStyle.NARRATIVE;

/**
 * Filter for a summary row a public visitor may see: READY and
 * complete, so neither an in-flight nor an incomplete row can shadow a
 * servable sibling during the share-language fallback.
 *
 * `language`: a code or null (Original) pins the row's language;
 * undefined matches any language.
 */
function publicSummaryWhere(
  transcriptId: string,
  language?: string | null
): Prisma.SummaryWhereInput {
  return { transcript_id: transcriptId, language, status: 'READY', ...COMPLETE_SUMMARY_WHERE };
}

/**
 * Filter for an article row a public visitor may see: READY with
 * content. A READY-with-null-content row isn't servable, so it must not
 * shadow a sibling that does have content. `language` behaves as in
 * {@link publicSummaryWhere}.
 */
function publicArticleWhere(
  transcriptId: string,
  style: ArticleStyle,
  language?: string | null
): Prisma.ArticleWhereInput {
  return {
    transcript_id: transcriptId,
    style,
    language,
    status: 'READY',
    content: { not: null },
  };
}

/** Where/order arguments for one `findFirst` of a share-row lookup. */
export interface ShareRowQuery<Where, OrderBy> {
  where: Where;
  orderBy?: OrderBy;
}

/**
 * Resolve the public summary row for `requested` with the shared
 * English-first fallback (see `resolveShareRow`), filtered by
 * {@link publicSummaryWhere}. `find` runs one `findFirst` with the
 * given where/order plus the caller's own `select`, so every caller
 * resolves the same row whatever fields it reads.
 */
export function resolvePublicSummary<T>(
  transcriptId: string,
  requested: string | null | undefined,
  find: (
    query: ShareRowQuery<Prisma.SummaryWhereInput, Prisma.SummaryOrderByWithRelationInput>
  ) => Promise<T | null>
): Promise<T | null> {
  return resolveShareRow(
    requested,
    (language) => find({ where: publicSummaryWhere(transcriptId, language) }),
    () => find({ where: publicSummaryWhere(transcriptId), orderBy: { generated_at: 'asc' } })
  );
}

/**
 * {@link resolvePublicSummary} for the article of `style`, filtered by
 * {@link publicArticleWhere}.
 */
export function resolvePublicArticle<T>(
  transcriptId: string,
  requested: string | null | undefined,
  style: ArticleStyle,
  find: (
    query: ShareRowQuery<Prisma.ArticleWhereInput, Prisma.ArticleOrderByWithRelationInput>
  ) => Promise<T | null>
): Promise<T | null> {
  return resolveShareRow(
    requested,
    (language) => find({ where: publicArticleWhere(transcriptId, style, language) }),
    () => find({ where: publicArticleWhere(transcriptId, style), orderBy: { generated_at: 'asc' } })
  );
}

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
 * `parseShareLanguage`), resolved by {@link resolvePublicSummary}.
 */
export async function loadPublicSummary(
  prisma: PrismaClient,
  transcriptId: string,
  requested: string | null | undefined
) {
  const fields = {
    select: { headline: true, short: true, full: true, language: true, generated_at: true },
  } as const;
  const summary = await resolvePublicSummary(transcriptId, requested, (query) =>
    prisma.summary.findFirst({ ...query, ...fields })
  );
  // The queries already exclude incomplete rows; this narrows the type.
  return isCompleteSummary(summary) ? summary : null;
}

/**
 * The article a public visitor sees for `requested` and `style`,
 * resolved by {@link resolvePublicArticle}.
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
  const article = await resolvePublicArticle(transcriptId, requested, style, (query) =>
    prisma.article.findFirst({ ...query, ...fields })
  );
  // The queries already exclude null content; this narrows the type.
  if (article == null || article.content == null) {
    return null;
  }
  return { ...article, content: article.content };
}
