import { ArticleStyle, type Prisma } from '@readtube/database';

import { COMPLETE_SUMMARY_WHERE } from '@/lib/workflows/summary/completeness';

/** Article style the public reader renders by default. */
export const PUBLIC_DEFAULT_ARTICLE_STYLE: ArticleStyle = ArticleStyle.NARRATIVE;

/**
 * Filter for a summary row a public share page may serve: READY and
 * complete, so neither an in-flight nor an incomplete row can shadow a
 * servable sibling during the share-language fallback.
 *
 * `language`: a code or null (Original) pins the row's language;
 * undefined matches any language.
 */
export function publicSummaryWhere(
  transcriptId: string,
  language?: string | null
): Prisma.SummaryWhereInput {
  return { transcript_id: transcriptId, language, status: 'READY', ...COMPLETE_SUMMARY_WHERE };
}

/**
 * Filter for an article row a public share page may serve: READY with
 * content. A READY-with-null-content row isn't servable (see the
 * private article GET for how those can arise), so it must not shadow
 * a sibling that has content. `language` behaves as in
 * {@link publicSummaryWhere}.
 */
export function publicArticleWhere(
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
