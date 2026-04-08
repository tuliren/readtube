import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';

import { prisma } from '@/lib/db';

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const videoId = BigInt(id);

  // IDOR check: ensure video belongs to a channel owned by this user
  const video = await prisma.video.findFirst({
    where: { id: videoId, channel: { userId } },
    select: { id: true, readAt: true },
  });
  if (!video) {
    return NextResponse.json({ error: 'Video not found' }, { status: 404 });
  }

  // Idempotent: only set readAt if not already read
  if (video.readAt === null) {
    await prisma.video.update({
      where: { id: videoId },
      data: { readAt: new Date() },
    });
  }

  return new NextResponse(null, { status: 204 });
}
