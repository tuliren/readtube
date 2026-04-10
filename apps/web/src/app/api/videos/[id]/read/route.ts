import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';

import { prisma } from '@/lib/db';

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const videoId = id;

  // IDOR check: ensure video belongs to a channel the user is subscribed to
  const video = await prisma.video.findFirst({
    where: { id: videoId, channel: { subscriptions: { some: { user_id: userId } } } },
    select: { id: true, read_at: true },
  });
  if (!video) {
    return NextResponse.json({ error: 'Video not found' }, { status: 404 });
  }

  // Idempotent: only set read_at if not already read
  if (video.read_at === null) {
    await prisma.video.update({
      where: { id: videoId },
      data: { read_at: new Date() },
    });
  }

  return new NextResponse(null, { status: 204 });
}
