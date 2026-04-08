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
    where: { user_id: userId },
    select: { id: true },
  });
  const channelIds = userChannels.map((c) => c.id);

  if (channelIds.length === 0) {
    return NextResponse.json([]);
  }

  // If channelId filter is specified, verify it belongs to this user
  if (channelIdParam && !channelIds.includes(channelIdParam)) {
    return NextResponse.json({ error: 'Channel not found' }, { status: 404 });
  }

  // Scoped to user's channels
  const scopedWhere = channelIdParam
    ? { channel_id: channelIdParam, channel: { user_id: userId } }
    : { channel_id: { in: channelIds } };

  const videos = await prisma.video.findMany({
    where: scopedWhere,
    select: {
      id: true,
      source_id: true,
      title: true,
      description: true,
      published_at: true,
      read_at: true,
      channel_id: true,
      channel: { select: { id: true, name: true, source_id: true } },
    },
    orderBy: [{ read_at: 'asc' }, { published_at: 'desc' }],
  });

  const unread = videos
    .filter((v) => v.read_at === null)
    .sort((a, b) => b.published_at.getTime() - a.published_at.getTime());
  const read = videos
    .filter((v) => v.read_at !== null)
    .sort((a, b) => b.published_at.getTime() - a.published_at.getTime());

  return NextResponse.json(
    [...unread, ...read].map((v) => ({
      id: v.id,
      sourceId: v.source_id,
      title: v.title,
      description: v.description,
      publishedAt: v.published_at,
      readAt: v.read_at,
      channelId: v.channel_id,
      channelName: v.channel.name,
      channelSourceId: v.channel.source_id,
    }))
  );
}
