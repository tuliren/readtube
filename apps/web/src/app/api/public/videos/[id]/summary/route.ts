import { prisma } from '@readtube/database';
import { NextRequest, NextResponse } from 'next/server';

/**
 * Sharing-intent gate: the public video page only renders when a
 * cached Summary or Article exists, so the public API routes apply
 * the same gate. A video without either artifact is treated as 404
 * even if the internal UUID is guessed correctly.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  console.info(`[public/summary/GET] Fetching public summary for video ${id}`);

  const video = await prisma.video.findFirst({
    where: { id },
    select: {
      id: true,
      transcripts: {
        orderBy: { created_at: 'desc' },
        take: 1,
        select: {
          id: true,
          summary: {
            select: {
              headline: true,
              short: true,
              full: true,
              generated_at: true,
            },
          },
          articles: { take: 1, select: { id: true } },
        },
      },
    },
  });
  if (!video) {
    console.error(`[public/summary/GET] Video ${id} not found`);
    return NextResponse.json({ error: 'Video not found' }, { status: 404 });
  }

  const transcript = video.transcripts[0];
  const hasAnyPublicArtifact =
    transcript != null && (transcript.summary != null || transcript.articles.length > 0);
  if (!hasAnyPublicArtifact) {
    console.error(`[public/summary/GET] Video ${id} has no public artifact`);
    return NextResponse.json({ error: 'Not public' }, { status: 404 });
  }
  if (!transcript.summary) {
    console.error(`[public/summary/GET] No cached summary for video ${id}`);
    return NextResponse.json({ error: 'Not cached' }, { status: 404 });
  }

  return NextResponse.json({
    headline: transcript.summary.headline,
    short: transcript.summary.short,
    full: transcript.summary.full,
    generatedAt: transcript.summary.generated_at,
  });
}
