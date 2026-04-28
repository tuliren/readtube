import { ArticleStyle, prisma } from '@readtube/database';
import { NextRequest, NextResponse } from 'next/server';

import { findTargetLanguage } from '@/lib/language/names';
import { parseLanguageQuery } from '@/lib/language/prompt';

const DEFAULT_STYLE: ArticleStyle = ArticleStyle.NARRATIVE;

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
  const parsed = parseLanguageQuery(request.nextUrl.searchParams.get('language'));
  // Validate against the curated picker list — see public summary
  // route for the rationale.
  const targetLanguage =
    parsed.kind === 'target' && findTargetLanguage(parsed.code) != null ? parsed.code : null;

  console.info(
    `[public/article/GET] Fetching public article for video ${id} (style=${style}, language=${targetLanguage ?? 'original'})`
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
          // Original isn't the same thing as "no public artifact."
          summaries: { take: 1, select: { transcript_id: true } },
          articles: { take: 1, select: { id: true } },
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

  // When a target is requested, look it up directly. Fall back to
  // the Original on miss so a tampered or stale share URL renders
  // the canonical version instead of 404'ing.
  const fields = {
    select: { content: true, style: true, language: true, generated_at: true },
  } as const;

  let article = null;
  if (targetLanguage != null) {
    article = await prisma.article.findFirst({
      where: { transcript_id: transcript.id, style, language: targetLanguage },
      ...fields,
    });
  }
  if (article == null) {
    article = await prisma.article.findFirst({
      where: { transcript_id: transcript.id, style, language: null },
      ...fields,
    });
  }
  if (!article) {
    console.error(`[public/article/GET] No cached article for video ${id} (style=${style})`);
    return NextResponse.json({ error: 'Not cached' }, { status: 404 });
  }

  return NextResponse.json({
    content: article.content,
    style: article.style,
    language: article.language,
    generatedAt: article.generated_at,
  });
}
