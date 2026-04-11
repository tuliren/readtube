import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';

import { prisma } from '@/lib/db';

export async function GET(request: NextRequest) {
  const { userId } = await auth();
  if (userId == null) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const channelIdParam = request.nextUrl.searchParams.get('channelId');

  // Get all channels user is subscribed to (with watermarks for read state)
  const userSubs = await prisma.userSubscription.findMany({
    where: { user_id: userId },
    select: { channel_id: true, read_at: true },
  });
  const channelIds = userSubs.map((s) => s.channel_id);
  const watermarkByChannelId = new Map<string, Date | null>(
    userSubs.map((s) => [s.channel_id, s.read_at])
  );

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
  // A video is "read" if either an explicit consumption row exists OR the
  // user's per-subscription watermark covers it.
  const readAtFor = (v: VideoRow): Date | null => {
    const explicit = v.consumptions[0]?.read_at;
    if (explicit != null) {
      return explicit;
    }
    const watermark = watermarkByChannelId.get(v.channel_id);
    if (watermark != null && v.published_at.getTime() <= watermark.getTime()) {
      return watermark;
    }
    return null;
  };

  const sorted = [...videos].sort((a, b) => b.published_at.getTime() - a.published_at.getTime());

  return NextResponse.json(
    sorted.map((v) => ({
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
