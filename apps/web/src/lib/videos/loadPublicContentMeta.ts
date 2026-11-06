import type { PrismaClient } from '@readtube/database';

import { resolveShareRow } from '@/lib/language/publicShare';
import {
  type PublicContentMeta,
  pickContentDates,
  toPlainDescription,
} from '@/lib/seo/videoJsonLd';
import {
  PUBLIC_ARTICLE_STYLE,
  publicArticleWhere,
  publicSummaryWhere,
} from '@/lib/videos/publicContent';

/**
 * Freshness, language, and description of the AI content a public
 * share page renders for `requested` (see `parseShareLanguage`). It
 * resolves the same summary and article rows the public API routes
 * serve, using the filters in `publicContent.ts`, so the dates describe
 * what the visitor actually reads: the earliest `generated_at` is the
 * published date, the latest the modified date. Returns null when the video has no transcript.
 */
export async function loadPublicContentMeta(
  prisma: PrismaClient,
  videoId: string,
  requested: string | null | undefined
): Promise<PublicContentMeta | null> {
  const transcript = await prisma.transcript.findFirst({
    where: { video_id: videoId },
    orderBy: { created_at: 'desc' },
    select: { id: true, language: true },
  });
  if (transcript == null) {
    return null;
  }

  const summarySelect = { select: { short: true, language: true, generated_at: true } } as const;
  const summary = await resolveShareRow(
    requested,
    (language) =>
      prisma.summary.findFirst({
        where: publicSummaryWhere(transcript.id, language),
        ...summarySelect,
      }),
    () =>
      prisma.summary.findFirst({
        where: publicSummaryWhere(transcript.id),
        orderBy: { generated_at: 'asc' },
        ...summarySelect,
      })
  );

  const articleSelect = { select: { language: true, generated_at: true } } as const;
  const style = PUBLIC_ARTICLE_STYLE;
  const article = await resolveShareRow(
    requested,
    (language) =>
      prisma.article.findFirst({
        where: publicArticleWhere(transcript.id, style, language),
        ...articleSelect,
      }),
    () =>
      prisma.article.findFirst({
        where: publicArticleWhere(transcript.id, style),
        orderBy: { generated_at: 'asc' },
        ...articleSelect,
      })
  );

  // The Original (language null) is in the transcript's language.
  const rendered = summary ?? article;
  const language = rendered == null ? null : (rendered.language ?? transcript.language);

  return {
    ...pickContentDates([summary?.generated_at, article?.generated_at]),
    language,
    description: toPlainDescription(summary?.short),
  };
}
