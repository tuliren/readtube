import { prisma } from '@readtube/database';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const video = await prisma.video.findFirst({
    where: { id },
    select: {
      id: true,
      transcript_unavailable: true,
      transcripts: {
        orderBy: { created_at: 'desc' },
        take: 1,
        select: { text: true, language: true },
      },
    },
  });
  if (!video) {
    return NextResponse.json({ error: 'Video not found' }, { status: 404 });
  }

  const cached = video.transcripts[0];
  if (cached != null) {
    return NextResponse.json({ segments: JSON.parse(cached.text), language: cached.language });
  }

  if (video.transcript_unavailable) {
    return NextResponse.json(
      { error: 'Transcript unavailable', code: 'unavailable' },
      { status: 410 }
    );
  }

  return NextResponse.json({ error: 'Not cached' }, { status: 404 });
}
