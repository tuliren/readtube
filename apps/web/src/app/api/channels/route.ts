import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';

import { prisma } from '@/lib/db';
import { ensureUserExists } from '@/lib/db/user';
import { buildRssUrl, extractChannelId, extractHandle } from '@/lib/youtube/channelUrl';
import { scrapeChannel } from '@/lib/youtube/scrapeChannel';

export async function GET() {
  const { userId } = await auth();
  if (userId == null) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const subscriptions = await prisma.userSubscription.findMany({
    where: { user_id: userId },
    select: {
      channel: {
        select: {
          id: true,
          source_id: true,
          name: true,
          rss_url: true,
          created_at: true,
          _count: { select: { videos: { where: { read_at: null } } } },
        },
      },
    },
  });

  const channels = subscriptions.map((s) => s.channel).sort((a, b) => a.name.localeCompare(b.name));

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
  if (userId == null) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { url?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const input = body.url?.trim() ?? '';
  if (input === '') {
    return NextResponse.json({ error: 'Missing URL' }, { status: 400 });
  }

  let channelPageUrl: string | null = null;

  const handle = extractHandle(input);
  if (handle != null) {
    channelPageUrl = `https://www.youtube.com/@${handle}`;
  } else {
    const bareId = extractChannelId(input);
    if (bareId != null) {
      channelPageUrl = `https://www.youtube.com/channel/${bareId}`;
    }
  }

  if (channelPageUrl == null) {
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

  // Check if user already subscribed to this channel
  const existingSub = await prisma.userSubscription.findFirst({
    where: { user_id: userId, channel: { source_id: sourceId } },
  });
  if (existingSub) {
    return NextResponse.json({ error: 'You already follow this channel.' }, { status: 409 });
  }

  const now = new Date();
  const rssUrl = buildRssUrl(sourceId);

  // Upsert the channel atomically — avoids a race condition where two users
  // concurrently subscribe to the same brand-new channel. On create, also
  // pre-seed the existing videos so new subscribers don't get a flood of
  // unread items. On update (channel already exists), do nothing — another
  // user already created it and we just want to piggyback on it.
  const channel = await prisma.channel.upsert({
    where: { source_id: sourceId },
    create: {
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
    update: {},
  });

  // Subscribe user to channel
  await prisma.userSubscription.create({
    data: { user_id: userId, channel_id: channel.id },
  });

  const channelWithCount = await prisma.channel.findUniqueOrThrow({
    where: { id: channel.id },
    include: { _count: { select: { videos: { where: { read_at: null } } } } },
  });

  return NextResponse.json(
    {
      id: channelWithCount.id,
      sourceId: channelWithCount.source_id,
      name: channelWithCount.name,
      rssUrl: channelWithCount.rss_url,
      createdAt: channelWithCount.created_at,
      unreadCount: channelWithCount._count.videos,
    },
    { status: 201 }
  );
}
