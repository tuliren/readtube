import { auth } from '@clerk/nextjs/server';
import { prisma } from '@readtube/database';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (userId == null) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const videoId = id;

  // IDOR check: ensure video belongs to a channel the user is subscribed to
  const video = await prisma.video.findFirst({
    where: { id: videoId, channel: { subscriptions: { some: { user_id: userId } } } },
    select: { id: true },
  });
  if (video == null) {
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
