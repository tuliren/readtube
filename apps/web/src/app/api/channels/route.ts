import { auth } from '@clerk/nextjs/server';
import { prisma } from '@readtube/database';
import { NextRequest, NextResponse } from 'next/server';

import { upsertChannelWithVideos } from '@/lib/channels/upsertChannelWithVideos';
import { ensureUserExists } from '@/lib/db/user';
import { fetchChannelSnapshot } from '@/lib/platforms/youtube/channelSnapshot';
import { buildRssUrl, extractChannelId, extractHandle } from '@/lib/platforms/youtube/urls';
import { isEmptyString } from '@/lib/string';
import {
  computeInitialReadAt,
  countUnreadVideos,
  getSubscribedChannelsWithUnread,
} from '@/lib/subscriptions';

export async function GET() {
  const { userId } = await auth();
  if (userId == null) {
    console.error('[channels/GET] Unauthorized');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  console.info(`[channels/GET] Listing subscribed channels for user ${userId}`);

  // Single SQL query: subscriptions + channel metadata + per-channel unread
  // counts (with watermark + consumption filter), all in one round-trip.
  const rows = await getSubscribedChannelsWithUnread(prisma, userId);

  return NextResponse.json(
    rows.map((row) => ({
      id: row.channel_id,
      sourceId: row.source_id,
      name: row.name,
      handle: row.handle,
      rssUrl: row.rss_url,
      logoUrl: row.logo_url ?? null,
      createdAt: row.created_at,
      unreadCount: row.unread_count,
      folderId: row.folder_id,
      priority: row.priority,
      muteUntil: row.mute_until,
    }))
  );
}

export async function POST(request: NextRequest) {
  const { userId } = await auth();
  if (userId == null) {
    console.error('[channels/POST] Unauthorized');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { url?: string };
  try {
    body = await request.json();
  } catch (err) {
    console.error('[channels/POST] Invalid request body:', err);
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const input = body.url?.trim() ?? '';
  if (isEmptyString(input)) {
    console.error('[channels/POST] Missing URL in request body');
    return NextResponse.json({ error: 'Missing URL' }, { status: 400 });
  }

  console.info(`[channels/POST] Adding channel: ${input} for user ${userId}`);

  let channelPageUrl: string | null = null;
  let preresolvedRssUrl: string | undefined;

  const handle = extractHandle(input);
  if (handle != null) {
    channelPageUrl = `https://www.youtube.com/@${handle}`;
  } else {
    const bareId = extractChannelId(input);
    if (bareId != null) {
      channelPageUrl = `https://www.youtube.com/channel/${bareId}`;
      preresolvedRssUrl = buildRssUrl(bareId);
    }
  }

  if (channelPageUrl == null) {
    console.error(`[channels/POST] Invalid channel URL: ${input}`);
    return NextResponse.json(
      {
        error:
          'Invalid channel URL. Paste a URL like youtube.com/@handle, youtube.com/channel/UC..., or a bare UC... channel ID.',
      },
      { status: 400 }
    );
  }

  let snapshot;
  try {
    snapshot = await fetchChannelSnapshot({ channelPageUrl, rssUrl: preresolvedRssUrl });
  } catch (err) {
    console.error(`[channels/POST] fetchChannelSnapshot failed for ${channelPageUrl}:`, err);
    return NextResponse.json(
      { error: 'Channel not found or not accessible. Check the URL and try again.' },
      { status: 400 }
    );
  }

  const sourceId = snapshot.channelId;

  // Ensure user exists in DB before writing FK reference
  await ensureUserExists(userId);

  // Check if user already subscribed to this channel
  const existingSub = await prisma.userSubscription.findFirst({
    where: { user_id: userId, channel: { source_id: sourceId } },
  });
  if (existingSub) {
    console.error(`[channels/POST] User ${userId} already subscribed to channel ${sourceId}`);
    return NextResponse.json({ error: 'You already follow this channel.' }, { status: 409 });
  }

  // Upsert the channel atomically. upsertChannelWithVideos guards
  // against the `(source_type, handle)` unique constraint when another
  // row already owns the scraped handle.
  const channel = await upsertChannelWithVideos(prisma, sourceId, snapshot);

  // Compute the initial read watermark per the configured subscription mode
  // (all_new / none_new / recent_n_new). Done after the channel + its videos
  // have been created above so the videos are queryable.
  const initialReadAt = await computeInitialReadAt(prisma, channel.id);

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
      handle: true,
      rss_url: true,
      logo_url: true,
      created_at: true,
    },
  });
  const unreadCount = await countUnreadVideos(prisma, userId, channel.id, initialReadAt);

  return NextResponse.json(
    {
      id: channelRow.id,
      sourceId: channelRow.source_id,
      name: channelRow.name,
      handle: channelRow.handle,
      rssUrl: channelRow.rss_url,
      logoUrl: channelRow.logo_url,
      createdAt: channelRow.created_at,
      unreadCount,
      folderId: null,
      priority: 0,
      muteUntil: null,
    },
    { status: 201 }
  );
}
