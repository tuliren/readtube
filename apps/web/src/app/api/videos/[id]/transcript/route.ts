import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';

import { prisma } from '@/lib/db';
import { fetchSubtitleViaYoutubei } from '@/lib/subtitles';

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const videoId = id;

  // IDOR check: ensure video belongs to a channel owned by this user
  const video = await prisma.video.findFirst({
    where: { id: videoId, channel: { user_id: userId } },
    select: {
      id: true,
      source_id: true,
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

  // Cache hit: return most recent transcript
  const cached = video.transcripts[0];
  if (cached) {
    return NextResponse.json({ segments: JSON.parse(cached.text), language: cached.language });
  }

  // Cache miss: fetch from service
  let result;
  try {
    result = await fetchSubtitleViaYoutubei(video.source_id);
  } catch {
    return NextResponse.json({ error: 'Transcript unavailable' }, { status: 404 });
  }

  // Cache in DB
  await prisma.transcript.create({
    data: {
      video_id: video.id,
      text: JSON.stringify(result.segments),
      fetched_at: new Date(),
    },
  });

  return NextResponse.json({ segments: result.segments });
}
