import { auth } from '@clerk/nextjs/server';
import { prisma } from '@readtube/database';
import { NextRequest, NextResponse } from 'next/server';

import { videoReachableByUser } from '@/lib/videos/marks';

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (userId == null) {
    console.error('[videos/read/POST] Unauthorized');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const videoId = id;

  console.info(`[videos/read/POST] Marking video ${videoId} as read for user ${userId}`);

  // IDOR check: same reachability rule as the reader and the triage
  // endpoints (subscription, library, or the user's own mark).
  const video = await prisma.video.findFirst({
    where: {
      id: videoId,
      ...videoReachableByUser(userId),
    },
    select: { id: true },
  });
  if (video == null) {
    console.error(`[videos/read/POST] Video ${videoId} not accessible by user ${userId}`);
    return NextResponse.json({ error: 'Video not found' }, { status: 404 });
  }

  // Idempotent — upsert is a no-op if a consumption row already exists.
  await prisma.userVideoConsumption.upsert({
    where: {
      user_video_consumption_unique_user_video: { user_id: userId, video_id: video.id },
    },
    create: { user_id: userId, video_id: video.id },
    update: {},
  });

  return new NextResponse(null, { status: 204 });
}
