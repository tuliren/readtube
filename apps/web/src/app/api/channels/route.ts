import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';

import { prisma } from '@/lib/db';
import { ensureUserExists } from '@/lib/db/user';
import { buildRssUrl, extractChannelId, extractHandle } from '@/lib/youtube/channelUrl';
import { scrapeChannel } from '@/lib/youtube/scrapeChannel';

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const channels = await prisma.channel.findMany({
    where: { user_id: userId },
    select: {
      id: true,
      source_id: true,
      name: true,
      rss_url: true,
      created_at: true,
      _count: { select: { videos: { where: { read_at: null } } } },
    },
    orderBy: { name: 'asc' },
  });

  return NextResponse.json(
    channels.map((c) => ({
      id: c.id,
      sourceId: c.source_id,
      name: c.name,
      rssUrl: c.rss_url,
      createdAt: c.created_at,
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

  const sourceId = scraped.channelId;

  // Ensure user exists in DB before writing FK reference
  await ensureUserExists(userId);

  // Check duplicate
  const existing = await prisma.channel.findFirst({
    where: { user_id: userId, source_id: sourceId },
  });
  if (existing) {
    return NextResponse.json({ error: 'You already follow this channel.' }, { status: 409 });
  }

  const now = new Date();
  const rssUrl = buildRssUrl(sourceId);

  const channel = await prisma.channel.create({
    data: {
      user_id: userId,
      source_id: sourceId,
      name: scraped.name,
      rss_url: rssUrl,
      videos: {
        create: scraped.videos.map((v) => ({
          source_id: v.videoId,
          title: v.title,
          description: v.description,
          published_at: v.publishedAt,
          read_at: now,
        })),
      },
    },
    include: {
      _count: { select: { videos: { where: { read_at: null } } } },
    },
  });

  return NextResponse.json(
    {
      id: channel.id,
      sourceId: channel.source_id,
      name: channel.name,
      rssUrl: channel.rss_url,
      createdAt: channel.created_at,
      unreadCount: 0,
    },
    { status: 201 }
  );
}
