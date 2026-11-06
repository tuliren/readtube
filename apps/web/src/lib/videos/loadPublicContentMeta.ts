import type { PrismaClient } from '@readtube/database';

import {
  type PublicContentMeta,
  pickContentDates,
  toPlainDescription,
} from '@/lib/seo/videoJsonLd';
import {
  PUBLIC_ARTICLE_STYLE,
  resolvePublicArticle,
  resolvePublicSummary,
} from '@/lib/videos/publicContent';

/**
 * Freshness, language, and description of the AI content a public
 * share page renders for `requested` (see `parseShareLanguage`).
 * `transcript` is the gated latest transcript from
 * `loadPublicVideoWithTranscript`. Rows are resolved by the same
 * `resolvePublicSummary` / `resolvePublicArticle` the public API routes
 * and the markdown rendition use, so the dates describe what the
 * visitor actually reads: the earliest `generated_at` is the published
 * date, the latest the modified date. Selects only the small columns
 * it needs, not the article body.
 */
export async function loadPublicContentMeta(
  prisma: PrismaClient,
  transcript: { id: string; language: string | null },
  requested: string | null | undefined
): Promise<PublicContentMeta> {
  const [summary, article] = await Promise.all([
    resolvePublicSummary(transcript.id, requested, (query) =>
      prisma.summary.findFirst({
        ...query,
        select: { short: true, language: true, generated_at: true },
      })
    ),
    resolvePublicArticle(transcript.id, requested, PUBLIC_ARTICLE_STYLE, (query) =>
      prisma.article.findFirst({ ...query, select: { language: true, generated_at: true } })
    ),
  ]);

  // The Original (language null) is in the transcript's language.
  const rendered = summary ?? article;
  const language = rendered == null ? null : (rendered.language ?? transcript.language);

  return {
    ...pickContentDates([summary?.generated_at, article?.generated_at]),
    language,
    description: toPlainDescription(summary?.short),
  };
}
