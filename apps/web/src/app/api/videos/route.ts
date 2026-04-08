import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';

import { prisma } from '@/lib/db';

export async function GET(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const channelIdParam = request.nextUrl.searchParams.get('channelId');

  // Get all channels for this user (for scoping)
  const userChannels = await prisma.channel.findMany({
    where: { userId },
    select: { id: true },
  });
  const channelIds = userChannels.map((c) => c.id);

  if (channelIds.length === 0) {
    return NextResponse.json([]);
  }

  const whereClause = channelIdParam
    ? { channelId: BigInt(channelIdParam), userId: undefined }
    : {};

  // Scoped to user's channels
  const scopedWhere = channelIdParam
    ? { channelId: BigInt(channelIdParam), channel: { userId } }
    : { channelId: { in: channelIds } };

  // Unread first (readAt null), then read, each sorted by publishedAt DESC
  const videos = await prisma.video.findMany({
    where: scopedWhere,
    select: {
      id: true,
      videoId: true,
      title: true,
      description: true,
      publishedAt: true,
      readAt: true,
      channelId: true,
      channel: { select: { id: true, name: true, channelId: true } },
    },
    orderBy: [{ readAt: 'asc' }, { publishedAt: 'desc' }],
  });

  // Null readAt sorts first with 'asc' — this is correct (unread before read).
  // Re-sort to ensure: all unread (readAt null) by publishedAt desc, then all read by publishedAt desc.
  const unread = videos
    .filter((v) => v.readAt === null)
    .sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime());
  const read = videos
    .filter((v) => v.readAt !== null)
    .sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime());

  const sorted = [...unread, ...read];

  void whereClause;

  return NextResponse.json(
    sorted.map((v) => ({
      id: v.id.toString(),
      videoId: v.videoId,
      title: v.title,
      description: v.description,
      publishedAt: v.publishedAt,
      readAt: v.readAt,
      channelId: v.channelId.toString(),
      channelName: v.channel.name,
      channelYtId: v.channel.channelId,
    }))
  );
}
