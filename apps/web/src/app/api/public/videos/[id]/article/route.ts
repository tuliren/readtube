import { ArticleStyle, prisma } from '@readtube/database';
import { NextRequest, NextResponse } from 'next/server';

const PROMPT_VERSION = 'v2';
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
    return NextResponse.json({ error: 'Invalid style' }, { status: 400 });
  }

  const video = await prisma.video.findFirst({
    where: { id },
    select: {
      id: true,
      transcripts: {
        orderBy: { created_at: 'desc' },
        take: 1,
        select: {
          id: true,
          summary: { select: { transcript_id: true } },
          articles: { take: 1, select: { id: true } },
        },
      },
    },
  });
  if (!video) {
    return NextResponse.json({ error: 'Video not found' }, { status: 404 });
  }

  const transcript = video.transcripts[0];
  const hasAnyPublicArtifact =
    transcript != null && (transcript.summary != null || transcript.articles.length > 0);
  if (!hasAnyPublicArtifact) {
    return NextResponse.json({ error: 'Not public' }, { status: 404 });
  }

  const article = await prisma.article.findUnique({
    where: {
      article_unique_transcript_style_version: {
        transcript_id: transcript.id,
        style,
        prompt_version: PROMPT_VERSION,
      },
    },
    select: { content: true, style: true, generated_at: true },
  });
  if (!article) {
    return NextResponse.json({ error: 'Not cached' }, { status: 404 });
  }

  return NextResponse.json({
    content: article.content,
    style: article.style,
    generatedAt: article.generated_at,
  });
}
