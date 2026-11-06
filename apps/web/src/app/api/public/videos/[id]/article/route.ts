import { ArticleStyle, prisma } from '@readtube/database';
import { NextRequest, NextResponse } from 'next/server';

import { parseShareLanguage, resolveShareRow } from '@/lib/language/publicShare';
import { PUBLIC_DEFAULT_ARTICLE_STYLE, publicArticleWhere } from '@/lib/videos/publicShareRows';

const DEFAULT_STYLE: ArticleStyle = PUBLIC_DEFAULT_ARTICLE_STYLE;

function parseStyle(raw: string | null | undefined): ArticleStyle | null {
  if (raw == null) {
    return DEFAULT_STYLE;
  }
  if (Object.values(ArticleStyle).includes(raw as ArticleStyle)) {
    return raw as ArticleStyle;
  }
  return null;
}

/**
 * Sharing-intent gate: mirrors the public video page, which only
 * renders when a cached Summary or Article exists. A video without
 * either artifact is treated as 404 even if the internal UUID is
 * guessed correctly.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const styleParam = request.nextUrl.searchParams.get('style');
  const style = parseStyle(styleParam);
  if (!style) {
    console.error(`[public/article/GET] Invalid style: ${styleParam}`);
    return NextResponse.json({ error: 'Invalid style' }, { status: 400 });
  }
  // See the public summary route for the language semantics.
  const requested = parseShareLanguage(request.nextUrl.searchParams.get('language'));

  console.info(
    `[public/article/GET] Fetching public article for video ${id} (style=${style}, language=${requested === undefined ? 'default' : (requested ?? 'original')})`
  );

  const video = await prisma.video.findFirst({
    where: { id },
    select: {
      id: true,
      transcripts: {
        orderBy: { created_at: 'desc' },
        take: 1,
        select: {
          id: true,
          // Match the public summary route: gate on the existence of
          // ANY summary or article row. Translations don't always
          // derive from a pre-existing Original (the user can pick a
          // target language as their first generation), so a missing
          // Original isn't the same thing as "no public artifact".
          // `status: READY` filters out in-flight workflow rows.
          summaries: {
            where: { status: 'READY' },
            take: 1,
            select: { transcript_id: true },
          },
          articles: {
            where: { status: 'READY' },
            take: 1,
            select: { id: true },
          },
        },
      },
    },
  });
  if (!video) {
    console.error(`[public/article/GET] Video ${id} not found`);
    return NextResponse.json({ error: 'Video not found' }, { status: 404 });
  }

  const transcript = video.transcripts[0];
  const hasAnyPublicArtifact =
    transcript != null && (transcript.summaries.length > 0 || transcript.articles.length > 0);
  if (!hasAnyPublicArtifact) {
    console.error(`[public/article/GET] Video ${id} has no public artifact`);
    return NextResponse.json({ error: 'Not public' }, { status: 404 });
  }

  const fields = {
    select: { content: true, style: true, language: true, generated_at: true },
  } as const;

  // `publicArticleWhere` requires `content != null` on every lookup so a
  // READY-with-null-content row can't shadow a sibling that has content.
  const findByLanguage = (language: string | null) =>
    prisma.article.findFirst({
      where: publicArticleWhere(transcript.id, style, language),
      ...fields,
    });

  const article = await resolveShareRow(requested, findByLanguage, () =>
    prisma.article.findFirst({
      where: publicArticleWhere(transcript.id, style),
      orderBy: { generated_at: 'asc' },
      ...fields,
    })
  );
  // Belt-and-suspenders: the queries above already exclude null content,
  // but keep the guard so `article.content` type-narrows before use.
  if (article == null || article.content == null) {
    console.info(`[public/article/GET] No cached article for video ${id} (style=${style})`);
    return NextResponse.json({ error: 'Not cached' }, { status: 404 });
  }

  return NextResponse.json({
    content: article.content,
    style: article.style,
    language: article.language,
    generatedAt: article.generated_at,
  });
}
