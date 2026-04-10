import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';

import { prisma } from '@/lib/db';

export async function POST(request: NextRequest) {
  const { userId } = await auth();
  if (userId == null) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Optional body: { channelId?: string } — if provided, only mark videos in that channel.
  let channelId: string | undefined;
  try {
    const body = (await request.json()) as { channelId?: unknown };
    if (typeof body.channelId === 'string') {
      channelId = body.channelId;
    }
  } catch {
    // Empty body — fall through to "all subscribed channels"
  }

  // Find the set of channels the user is subscribed to.
  const userSubs = await prisma.userSubscription.findMany({
    where: { user_id: userId },
    select: { channel_id: true },
  });
  const userChannelIds = userSubs.map((s) => s.channel_id);

  if (userChannelIds.length === 0) {
    return NextResponse.json({ marked: 0 });
  }

  // If channelId was provided, validate ownership and scope to it.
  let scopeChannelIds: string[];
  if (channelId != null) {
    if (!userChannelIds.includes(channelId)) {
      return NextResponse.json({ error: 'Channel not found' }, { status: 404 });
    }
    scopeChannelIds = [channelId];
  } else {
    scopeChannelIds = userChannelIds;
  }

  // Find all videos in scope that don't have a consumption row for this user.
  const unreadVideos = await prisma.video.findMany({
    where: {
      channel_id: { in: scopeChannelIds },
      consumptions: { none: { user_id: userId } },
    },
    select: { id: true },
  });

  if (unreadVideos.length === 0) {
    return NextResponse.json({ marked: 0 });
  }

  // skipDuplicates guards against the race window where another mark-read
  // request inserts a row between our findMany and createMany.
  const result = await prisma.userVideoConsumption.createMany({
    data: unreadVideos.map((v) => ({ user_id: userId, video_id: v.id })),
    skipDuplicates: true,
  });

  return NextResponse.json({ marked: result.count });
}
