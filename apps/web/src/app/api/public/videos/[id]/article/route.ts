import { ArticleStyle, prisma } from '@readtube/database';
import { NextRequest, NextResponse } from 'next/server';

import { parseShareLanguage } from '@/lib/language/publicShare';
import {
  PUBLIC_ARTICLE_STYLE,
  findPublicTranscript,
  loadPublicArticle,
} from '@/lib/videos/publicContent';

function parseStyle(raw: string | null | undefined): ArticleStyle | null {
  if (raw == null) {
    return PUBLIC_ARTICLE_STYLE;
  }
  if (Object.values(ArticleStyle).includes(raw as ArticleStyle)) {
    return raw as ArticleStyle;
  }
  return null;
}

/**
 * Sharing-intent gate: mirrors the public video page, which only
 * renders when a cached Summary or Article exists (see
 * `findPublicTranscript`). A video without either artifact is treated
 * as 404 even if the internal UUID is guessed correctly.
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

  const { videoExists, transcriptId } = await findPublicTranscript(prisma, id);
  if (!videoExists) {
    console.error(`[public/article/GET] Video ${id} not found`);
    return NextResponse.json({ error: 'Video not found' }, { status: 404 });
  }
  if (transcriptId == null) {
    console.error(`[public/article/GET] Video ${id} has no public artifact`);
    return NextResponse.json({ error: 'Not public' }, { status: 404 });
  }

  const article = await loadPublicArticle(prisma, transcriptId, requested, style);
  if (article == null) {
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
