import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';

import { prisma } from '@/lib/db';
import { buildRssUrl, extractChannelId, extractHandle } from '@/lib/youtube/channelUrl';
import { scrapeChannel } from '@/lib/youtube/scrapeChannel';

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

  // Build the YouTube channel URL to scrape
  let channelPageUrl: string | null = null;

  const handle = extractHandle(input);
  if (handle) {
    channelPageUrl = `https://www.youtube.com/@${handle}`;
  } else {
    const bareId = extractChannelId(input);
    if (bareId) {
      channelPageUrl = `https://www.youtube.com/channel/${bareId}`;
    }
  }

  if (!channelPageUrl) {
    return NextResponse.json(
      {
        error:
          'Invalid channel URL. Paste a URL like youtube.com/@handle, youtube.com/channel/UC..., or a bare UC... channel ID.',
      },
      { status: 400 }
    );
  }

  let scraped;
  try {
    scraped = await scrapeChannel(channelPageUrl);
  } catch (err) {
    console.error('[channels/POST] scrapeChannel failed:', err);
    return NextResponse.json(
      { error: 'Channel not found or not accessible. Check the URL and try again.' },
      { status: 400 }
    );
  }

  const channelId = scraped.channelId;

  // Check duplicate
  const existing = await prisma.channel.findFirst({
    where: { userId, channelId },
  });
  if (existing) {
    return NextResponse.json({ error: 'You already follow this channel.' }, { status: 409 });
  }

  const now = new Date();
  const rssUrl = buildRssUrl(channelId);

  // Create channel + backfill videos (all marked as read — only future cron videos show as unread)
  const channel = await prisma.channel.create({
    data: {
      userId,
      channelId,
      name: scraped.name,
      rssUrl,
      videos: {
        create: scraped.videos.map((v) => ({
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
