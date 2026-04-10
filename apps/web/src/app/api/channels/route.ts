import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';

import { prisma } from '@/lib/db';
import { ensureUserExists } from '@/lib/db/user';
import { isEmptyString } from '@/lib/string';
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
          _count: {
            select: { videos: { where: { consumptions: { none: { user_id: userId } } } } },
          },
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
  if (isEmptyString(input)) {
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

  const rssUrl = buildRssUrl(sourceId);

  // Upsert the channel atomically — avoids a race condition where two users
  // concurrently subscribe to the same brand-new channel. New videos are created
  // with no UserVideoConsumption rows, so they appear unread for everyone until
  // the user actually opens them.
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
        })),
      },
    },
    update: {},
  });

  // Subscribe user to channel. Use upsert to gracefully handle the race window
  // between the existingSub check above and this write — if two concurrent
  // requests from the same user both pass the check, the second one becomes a
  // no-op instead of failing with a unique-constraint violation.
  await prisma.userSubscription.upsert({
    where: {
      subscription_unique_user_channel: { user_id: userId, channel_id: channel.id },
    },
    create: { user_id: userId, channel_id: channel.id },
    update: {},
  });

  const channelWithCount = await prisma.channel.findUniqueOrThrow({
    where: { id: channel.id },
    include: {
      _count: {
        select: { videos: { where: { consumptions: { none: { user_id: userId } } } } },
      },
    },
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
