import { auth } from '@clerk/nextjs/server';
import { prisma } from '@readtube/database';
import { NextRequest, NextResponse } from 'next/server';

import { markLibraryRead, markPlaylistRead, markStandaloneRead } from '@/lib/markAllRead';
import { markAllReadForUser, markFolderReadForUser } from '@/lib/subscriptions';

export async function POST(request: NextRequest) {
  const { userId } = await auth();
  if (userId == null) {
    console.error('[videos/mark-all-read/POST] Unauthorized');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Optional body:
  //   { folderId?: string }     — mark subscribed channels in one folder
  //   { channelId?: string }    — mark videos in one subscribed channel
  //   { playlistId?: string }   — mark videos in one playlist (watermark)
  //   { library?: true }        — mark All library videos (standalone + every playlist)
  //   { standaloneOnly?: true } — mark only videos not in any playlist
  //   (empty)                   — mark all subscribed channels
  let folderId: string | undefined;
  let channelId: string | undefined;
  let playlistId: string | undefined;
  let library = false;
  let standaloneOnly = false;
  try {
    const body = (await request.json()) as {
      folderId?: unknown;
      channelId?: unknown;
      playlistId?: unknown;
      library?: unknown;
      standaloneOnly?: unknown;
    };
    if ('folderId' in body) {
      if (typeof body.folderId !== 'string' || body.folderId.trim().length === 0) {
        return NextResponse.json({ error: 'Invalid folderId' }, { status: 400 });
      }
      folderId = body.folderId;
    }
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
    folderId,
    playlistId,
    library,
    standaloneOnly,
  });

  if (folderId != null) {
    const result = await markFolderReadForUser(prisma, userId, folderId);
    if (result == null) {
      return NextResponse.json({ error: 'Folder not found' }, { status: 404 });
    }
    return NextResponse.json({ ok: true, channels: result.channels });
  }

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
