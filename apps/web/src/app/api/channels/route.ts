import { auth } from '@clerk/nextjs/server';
import { prisma } from '@readtube/database';
import { NextRequest, NextResponse } from 'next/server';
import { start } from 'workflow/api';

import { isChannelFresh } from '@/lib/channels/staleness';
import { ensureUserExists } from '@/lib/db/user';
import { detectChannelSource } from '@/lib/platforms';
import { isEmptyString } from '@/lib/string';
import {
  computeInitialReadAt,
  countUnreadVideos,
  getSubscribedChannelsWithUnread,
} from '@/lib/subscriptions';
import {
  type AddChannelResult,
  FETCH_FAILED_PREFIX,
  INVALID_URL_PREFIX,
  addChannelWorkflow,
} from '@/lib/workflows/add-channel';

const INVALID_URL_MESSAGE =
  'Invalid channel URL. Paste a YouTube channel URL ' +
  '(youtube.com/@handle or youtube.com/channel/UC...) or a Bilibili space URL ' +
  '(space.bilibili.com/<mid>).';

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
      platform: row.source_type,
      name: row.name,
      handle: row.handle,
      rssUrl: row.rss_url,
      logoUrl: row.logo_url ?? null,
      createdAt: row.created_at,
      checkedAt: row.checked_at,
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

  // Fast path: sync-parse the source_id (works for YouTube /channel/UC
  // URLs, bare UC ids, Bilibili space URLs, bare numeric mids). Check
  // the DB before any network I/O. If the row exists AND its
  // checked_at is within STALE_DAYS, skip the upstream fetch and
  // just attach the user's subscription.
  //
  // Shadow rows (created as a side effect by the add-video /
  // add-playlist flow) have checked_at = null, so they correctly
  // fall through to the fetch branch — otherwise the user would
  // subscribe to a channel that never gets its video list hydrated.
  const directSource = detectChannelSource(input);
  if (directSource != null) {
    const fastRow = await prisma.channel.findUnique({
      where: {
        channel_unique_source: {
          source_type: directSource.platform.type,
          source_id: directSource.sourceId,
        },
      },
    });
    if (fastRow != null) {
      const alreadySubscribed = await prisma.userSubscription.findFirst({
        where: { user_id: userId, channel_id: fastRow.id },
        select: { id: true },
      });
      if (alreadySubscribed != null) {
        console.error(
          `[channels/POST] User ${userId} already subscribed to channel ${directSource.sourceId}`
        );
        return NextResponse.json({ error: 'You already follow this channel.' }, { status: 409 });
      }
      if (isChannelFresh(fastRow.checked_at)) {
        console.info(`[channels/POST] Using fresh cached row for ${directSource.sourceId}`);
        await ensureUserExists(userId);
        return finishSubscribe(userId, fastRow.id);
      }
    }
  }

  // Slow path: hand the URL → snapshot → upsert work to a workflow.
  // Concurrent adds of the same channel are safe because the workflow
  // calls `upsertChannelWithVideos` which is idempotent on
  // `(source_type, source_id)` and `video_unique_source`.
  const run = await start(addChannelWorkflow, [{ input }]);
  let result: AddChannelResult;
  try {
    result = await run.returnValue;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.startsWith(INVALID_URL_PREFIX)) {
      console.error(`[channels/POST] Invalid channel URL: ${input}`);
      return NextResponse.json({ error: INVALID_URL_MESSAGE }, { status: 400 });
    }
    if (message.startsWith(FETCH_FAILED_PREFIX)) {
      console.error(`[channels/POST] addChannelWorkflow fetch failed for ${input}:`, err);
      return NextResponse.json(
        { error: 'Channel not found or not accessible. Check the URL and try again.' },
        { status: 400 }
      );
    }
    console.error(`[channels/POST] addChannelWorkflow failed for ${input}:`, err);
    return NextResponse.json({ error: 'Failed to add channel.' }, { status: 500 });
  }

  // Ensure user exists in DB before writing FK reference
  await ensureUserExists(userId);

  // Re-check duplicate subscription post-workflow. Two-tab races and
  // the YouTube @handle path (which only knows the canonical sourceId
  // after the workflow scrapes) both land here.
  const existingSub = await prisma.userSubscription.findFirst({
    where: { user_id: userId, channel_id: result.channelId },
  });
  if (existingSub) {
    console.error(
      `[channels/POST] User ${userId} already subscribed to channel ${result.sourceId}`
    );
    return NextResponse.json({ error: 'You already follow this channel.' }, { status: 409 });
  }

  return finishSubscribe(userId, result.channelId);
}

/**
 * Create the UserSubscription (if missing) and return the ChannelData
 * payload the client expects. Extracted so both the fast-path
 * (existing+fresh channel, no fetch) and the slow-path (fresh fetch +
 * upsert) can share it.
 *
 * `userSubscription.upsert` gracefully handles the race window between
 * the "already subscribed" check and this write: if two concurrent
 * requests from the same user both pass the check, the second one
 * becomes a no-op on the empty `update` branch instead of failing
 * with a unique-constraint violation. The read_at watermark is set on
 * create only so a re-subscribe race can't reset an existing user's
 * read state.
 */
async function finishSubscribe(userId: string, channelId: string) {
  const initialReadAt = await computeInitialReadAt(prisma, channelId);

  await prisma.userSubscription.upsert({
    where: {
      subscription_unique_user_channel: { user_id: userId, channel_id: channelId },
    },
    create: { user_id: userId, channel_id: channelId, read_at: initialReadAt },
    update: {},
  });

  const channelRow = await prisma.channel.findUniqueOrThrow({
    where: { id: channelId },
    select: {
      id: true,
      source_type: true,
      source_id: true,
      name: true,
      handle: true,
      rss_url: true,
      logo_url: true,
      created_at: true,
      checked_at: true,
    },
  });
  const unreadCount = await countUnreadVideos(prisma, userId, channelId, initialReadAt);

  return NextResponse.json(
    {
      id: channelRow.id,
      sourceId: channelRow.source_id,
      platform: channelRow.source_type,
      name: channelRow.name,
      handle: channelRow.handle,
      rssUrl: channelRow.rss_url,
      logoUrl: channelRow.logo_url,
      createdAt: channelRow.created_at,
      checkedAt: channelRow.checked_at,
      unreadCount,
      folderId: null,
      priority: 0,
      muteUntil: null,
    },
    { status: 201 }
  );
}
