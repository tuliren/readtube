import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';

import { prisma } from '@/lib/db';
import { ensureUserExists } from '@/lib/db/user';
import { isEmptyString } from '@/lib/string';
import { NEW_SUBSCRIPTION_MODE, RECENT_NEW_VIDEO_COUNT } from '@/lib/subscriptionConfig';
import { buildRssUrl, extractChannelId, extractHandle } from '@/lib/youtube/channelUrl';
import { scrapeChannel } from '@/lib/youtube/scrapeChannel';

/**
 * Compute the initial value for `UserSubscription.read_at` for a brand-new
 * subscription, based on `NEW_SUBSCRIPTION_MODE`.
 */
async function computeInitialReadAt(channelId: string): Promise<Date | null> {
  if (NEW_SUBSCRIPTION_MODE === 'all_new') {
    return null;
  }
  if (NEW_SUBSCRIPTION_MODE === 'none_new') {
    return new Date();
  }
  // recent_n_new: find the (N+1)th most recent video. Anything older or equal
  // to its published_at is read; the N most recent stay unread. If the channel
  // has fewer than (N+1) videos, fall through to "all unread" (read_at = null).
  const cutoff = await prisma.video.findMany({
    where: { channel_id: channelId },
    select: { published_at: true },
    orderBy: { published_at: 'desc' },
    skip: RECENT_NEW_VIDEO_COUNT,
    take: 1,
  });
  return cutoff[0]?.published_at ?? null;
}

/**
 * Count unread videos for a (user, channel) given the user's watermark.
 * A video is unread iff there's no UserVideoConsumption row for this user
 * AND it was published after the watermark (or there's no watermark).
 */
async function countUnreadVideos(
  userId: string,
  channelId: string,
  readAt: Date | null
): Promise<number> {
  return prisma.video.count({
    where: {
      channel_id: channelId,
      consumptions: { none: { user_id: userId } },
      ...(readAt != null ? { published_at: { gt: readAt } } : {}),
    },
  });
}

export async function GET() {
  const { userId } = await auth();
  if (userId == null) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const subscriptions = await prisma.userSubscription.findMany({
    where: { user_id: userId },
    select: {
      read_at: true,
      channel: {
        select: {
          id: true,
          source_id: true,
          name: true,
          rss_url: true,
          created_at: true,
        },
      },
    },
  });

  // Per-subscription counts respect the per-subscription read_at watermark.
  // We can't use Prisma's `_count` aggregation here because the filter must
  // reference the parent row's read_at, which `_count` doesn't support.
  const channelsWithCounts = await Promise.all(
    subscriptions.map(async (sub) => {
      const unreadCount = await countUnreadVideos(userId, sub.channel.id, sub.read_at);
      return { ...sub.channel, unreadCount };
    })
  );

  const sorted = channelsWithCounts.sort((a, b) => a.name.localeCompare(b.name));

  return NextResponse.json(
    sorted.map((c) => ({
      id: c.id,
      sourceId: c.source_id,
      name: c.name,
      rssUrl: c.rss_url,
      createdAt: c.created_at,
      unreadCount: c.unreadCount,
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

  // Compute the initial read watermark per the configured subscription mode
  // (all_new / none_new / recent_n_new). Done after the channel + its videos
  // have been created above so the videos are queryable.
  const initialReadAt = await computeInitialReadAt(channel.id);

  // Subscribe user to channel. Use upsert to gracefully handle the race window
  // between the existingSub check above and this write — if two concurrent
  // requests from the same user both pass the check, the second one becomes a
  // no-op instead of failing with a unique-constraint violation. The watermark
  // is set on create only; the update branch is intentionally empty so a
  // re-subscription race doesn't reset an existing user's read state.
  await prisma.userSubscription.upsert({
    where: {
      subscription_unique_user_channel: { user_id: userId, channel_id: channel.id },
    },
    create: { user_id: userId, channel_id: channel.id, read_at: initialReadAt },
    update: {},
  });

  const channelRow = await prisma.channel.findUniqueOrThrow({
    where: { id: channel.id },
    select: {
      id: true,
      source_id: true,
      name: true,
      rss_url: true,
      created_at: true,
    },
  });
  const unreadCount = await countUnreadVideos(userId, channel.id, initialReadAt);

  return NextResponse.json(
    {
      id: channelRow.id,
      sourceId: channelRow.source_id,
      name: channelRow.name,
      rssUrl: channelRow.rss_url,
      createdAt: channelRow.created_at,
      unreadCount,
    },
    { status: 201 }
  );
}
