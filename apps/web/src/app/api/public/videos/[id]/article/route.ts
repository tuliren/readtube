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
        select: { id: true },
      },
    },
  });
  if (!video) {
    return NextResponse.json({ error: 'Video not found' }, { status: 404 });
  }

  const transcript = video.transcripts[0];
  if (!transcript) {
    return NextResponse.json({ error: 'Not cached' }, { status: 404 });
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
