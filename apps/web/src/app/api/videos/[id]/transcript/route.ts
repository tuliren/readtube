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
  const videoId = BigInt(id);

  // IDOR check: ensure video belongs to a channel owned by this user
  const video = await prisma.video.findFirst({
    where: { id: videoId, channel: { userId } },
    select: { id: true, videoId: true, transcriptText: true, transcriptFetchedAt: true },
  });
  if (!video) {
    return NextResponse.json({ error: 'Video not found' }, { status: 404 });
  }

  // Cache hit
  if (video.transcriptText !== null) {
    return NextResponse.json({ segments: JSON.parse(video.transcriptText) });
  }

  // Cache miss: fetch from service
  let result;
  try {
    result = await fetchSubtitleViaYoutubei(video.videoId);
  } catch {
    return NextResponse.json({ error: 'Transcript unavailable' }, { status: 404 });
  }

  // Cache in DB
  const transcriptText = JSON.stringify(result.segments);
  await prisma.video.update({
    where: { id: videoId },
    data: { transcriptText, transcriptFetchedAt: new Date() },
  });

  return NextResponse.json({ segments: result.segments });
}
