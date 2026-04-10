import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';

import { prisma } from '@/lib/db';

export async function GET(request: NextRequest) {
  const { userId } = await auth();
  if (userId == null) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const channelIdParam = request.nextUrl.searchParams.get('channelId');

  // Get all channels user is subscribed to
  const userSubs = await prisma.userSubscription.findMany({
    where: { user_id: userId },
    select: { channel_id: true },
  });
  const channelIds = userSubs.map((s) => s.channel_id);

  if (channelIds.length === 0) {
    return NextResponse.json([]);
  }

  // If channelId filter is specified, verify it belongs to this user
  if (channelIdParam && !channelIds.includes(channelIdParam)) {
    return NextResponse.json({ error: 'Channel not found' }, { status: 404 });
  }

  // Scoped to user's channels
  const scopedWhere = channelIdParam
    ? { channel_id: channelIdParam }
    : { channel_id: { in: channelIds } };

  const videos = await prisma.video.findMany({
    where: scopedWhere,
    select: {
      id: true,
      source_id: true,
      title: true,
      description: true,
      published_at: true,
      channel_id: true,
      channel: { select: { id: true, name: true, source_id: true } },
      consumptions: {
        where: { user_id: userId },
        select: { read_at: true },
        take: 1,
      },
    },
  });

  type VideoRow = (typeof videos)[number];
  const readAtFor = (v: VideoRow): Date | null => v.consumptions[0]?.read_at ?? null;

  const unread = videos
    .filter((v) => readAtFor(v) === null)
    .sort((a, b) => b.published_at.getTime() - a.published_at.getTime());
  const read = videos
    .filter((v) => readAtFor(v) !== null)
    .sort((a, b) => b.published_at.getTime() - a.published_at.getTime());

  return NextResponse.json(
    [...unread, ...read].map((v) => ({
      id: v.id,
      sourceId: v.source_id,
      title: v.title,
      description: v.description,
      publishedAt: v.published_at,
      readAt: readAtFor(v),
      channelId: v.channel_id,
      channelName: v.channel.name,
      channelSourceId: v.channel.source_id,
    }))
  );
}
