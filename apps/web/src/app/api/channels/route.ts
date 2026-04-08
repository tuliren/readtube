import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';

import { prisma } from '@/lib/db';
import {
  buildRssUrl,
  extractChannelId,
  extractHandle,
  resolveHandleToChannelId,
} from '@/lib/youtube/channelUrl';
import { fetchRssFeed } from '@/lib/youtube/rss';

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const channels = await prisma.channel.findMany({
    where: { userId },
    select: {
      id: true,
      channelId: true,
      name: true,
      rssUrl: true,
      createdAt: true,
      _count: { select: { videos: { where: { readAt: null } } } },
    },
    orderBy: { name: 'asc' },
  });

  return NextResponse.json(
    channels.map((c) => ({
      id: c.id.toString(),
      channelId: c.channelId,
      name: c.name,
      rssUrl: c.rssUrl,
      createdAt: c.createdAt,
      unreadCount: c._count.videos,
    }))
  );
}

export async function POST(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { url?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const input = body.url?.trim() ?? '';
  if (!input) {
    return NextResponse.json({ error: 'Missing URL' }, { status: 400 });
  }

  let channelId = extractChannelId(input);

  // /@handle URL — resolve to UC channel ID by fetching the channel page
  if (!channelId) {
    const handle = extractHandle(input);
    if (handle) {
      channelId = await resolveHandleToChannelId(handle);
    }
  }

  if (!channelId) {
    return NextResponse.json(
      {
        error:
          'Invalid channel URL. Paste a URL like youtube.com/@handle, youtube.com/channel/UC..., or a bare UC... channel ID.',
      },
      { status: 400 }
    );
  }

  // Check duplicate
  const existing = await prisma.channel.findFirst({
    where: { userId, channelId },
  });
  if (existing) {
    return NextResponse.json({ error: 'You already follow this channel.' }, { status: 409 });
  }

  // Fetch RSS to validate the channel exists and get name/videos
  const rssUrl = buildRssUrl(channelId);
  let feed;
  try {
    feed = await fetchRssFeed(rssUrl);
  } catch {
    return NextResponse.json(
      { error: 'Channel not found or not accessible. Check the URL and try again.' },
      { status: 400 }
    );
  }

  const now = new Date();

  // Create channel + backfill videos (all marked as read — only future cron videos show as unread)
  const channel = await prisma.channel.create({
    data: {
      userId,
      channelId,
      name: feed.name,
      rssUrl,
      videos: {
        create: feed.videos.map((v) => ({
          videoId: v.videoId,
          title: v.title,
          description: v.description,
          publishedAt: v.publishedAt,
          readAt: now, // backfill: start fresh
        })),
      },
    },
    include: {
      _count: { select: { videos: { where: { readAt: null } } } },
    },
  });

  return NextResponse.json(
    {
      id: channel.id.toString(),
      channelId: channel.channelId,
      name: channel.name,
      rssUrl: channel.rssUrl,
      createdAt: channel.createdAt,
      unreadCount: 0,
    },
    { status: 201 }
  );
}
