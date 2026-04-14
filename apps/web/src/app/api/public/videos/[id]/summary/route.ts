import { prisma } from '@readtube/database';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

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
        },
      },
    },
  });
  if (!video) {
    return NextResponse.json({ error: 'Video not found' }, { status: 404 });
  }

  const transcript = video.transcripts[0];
  if (!transcript?.summary) {
    return NextResponse.json({ error: 'Not cached' }, { status: 404 });
  }

  return NextResponse.json({
    headline: transcript.summary.headline,
    short: transcript.summary.short,
    full: transcript.summary.full,
    generatedAt: transcript.summary.generated_at,
  });
}
