import { auth } from '@clerk/nextjs/server';
import { prisma } from '@readtube/database';
import { NextRequest, NextResponse } from 'next/server';

import { markLibraryRead, markPlaylistRead, markStandaloneRead } from '@/lib/markAllRead';
import { markAllReadForUser } from '@/lib/subscriptions';

export async function POST(request: NextRequest) {
  const { userId } = await auth();
  if (userId == null) {
    console.error('[videos/mark-all-read/POST] Unauthorized');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Optional body:
  //   { channelId?: string }    — mark videos in one subscribed channel
  //   { playlistId?: string }   — mark videos in one playlist (watermark)
  //   { library?: true }        — mark All library videos (standalone + every playlist)
  //   { standaloneOnly?: true } — mark only videos not in any playlist
  //   (empty)                   — mark all subscribed channels
  let channelId: string | undefined;
  let playlistId: string | undefined;
  let library = false;
  let standaloneOnly = false;
  try {
    const body = (await request.json()) as {
      channelId?: unknown;
      playlistId?: unknown;
      library?: unknown;
      standaloneOnly?: unknown;
    };
    if (typeof body.channelId === 'string') {
      channelId = body.channelId;
    }
    if (typeof body.playlistId === 'string') {
      playlistId = body.playlistId;
    }
    if (body.library === true) {
      library = true;
    }
    if (body.standaloneOnly === true) {
      standaloneOnly = true;
    }
  } catch {
    // Empty body — fall through to "all subscribed channels"
  }

  console.info(`[videos/mark-all-read/POST] Marking read for user ${userId}`, {
    channelId,
    playlistId,
    library,
    standaloneOnly,
  });

  if (playlistId != null) {
    const result = await markPlaylistRead(prisma, userId, playlistId);
    if (result == null) {
      console.error(
        `[videos/mark-all-read/POST] Playlist ${playlistId} not found for user ${userId}`
      );
      return NextResponse.json({ error: 'Playlist not found' }, { status: 404 });
    }
    return NextResponse.json(result);
  }

  if (standaloneOnly) {
    const result = await markStandaloneRead(prisma, userId);
    return NextResponse.json({ ok: true, count: result.count });
  }

  if (library) {
    await markLibraryRead(prisma, userId);
    return NextResponse.json({ ok: true });
  }

  // Default: mark subscribed channels as read.
  const result = await markAllReadForUser(prisma, userId, channelId);
  if (result == null) {
    console.error(`[videos/mark-all-read/POST] Channel ${channelId} not found for user ${userId}`);
    return NextResponse.json({ error: 'Channel not found' }, { status: 404 });
  }
  return NextResponse.json({ ok: true, channels: result.channels });
}
