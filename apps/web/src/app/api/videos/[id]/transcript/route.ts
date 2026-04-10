import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';

import { prisma } from '@/lib/db';
import { fetchSubtitleViaTranscriptApi } from '@/lib/subtitles';

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (userId == null) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  // IDOR check + fetch most recent cached transcript
  const video = await prisma.video.findFirst({
    where: { id, channel: { subscriptions: { some: { user_id: userId } } } },
    select: {
      id: true,
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
  if (!cached) {
    return NextResponse.json({ error: 'Not cached' }, { status: 404 });
  }

  return NextResponse.json({ segments: JSON.parse(cached.text), language: cached.language });
}

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (userId == null) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  // IDOR check
  const video = await prisma.video.findFirst({
    where: { id, channel: { subscriptions: { some: { user_id: userId } } } },
    select: { id: true, source_id: true },
  });
  if (!video) {
    return NextResponse.json({ error: 'Video not found' }, { status: 404 });
  }

  let result;
  try {
    result = await fetchSubtitleViaTranscriptApi(video.source_id);
  } catch (err) {
    console.error('[transcript/POST] fetch failed:', err);
    return NextResponse.json({ error: 'Transcript unavailable' }, { status: 404 });
  }

  await prisma.transcript.create({
    data: {
      video_id: video.id,
      text: JSON.stringify(result.segments),
      language: result.language,
      fetched_at: new Date(),
    },
  });

  return NextResponse.json({ segments: result.segments, language: result.language });
}
