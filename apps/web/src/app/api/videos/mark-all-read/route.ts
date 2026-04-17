import { auth } from '@clerk/nextjs/server';
import { prisma } from '@readtube/database';
import { NextRequest, NextResponse } from 'next/server';

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

  const now = new Date();

  console.info(`[videos/mark-all-read/POST] Marking read for user ${userId}`, {
    channelId,
    playlistId,
    library,
    standaloneOnly,
  });

  // Mark a single playlist as read via watermark.
  if (playlistId != null) {
    const pl = await prisma.playlist.findFirst({
      where: { id: playlistId, user_id: userId },
      select: { id: true },
    });
    if (pl == null) {
      console.error(
        `[videos/mark-all-read/POST] Playlist ${playlistId} not found for user ${userId}`
      );
      return NextResponse.json({ error: 'Playlist not found' }, { status: 404 });
    }
    await prisma.playlist.update({ where: { id: pl.id }, data: { read_at: now } });
    return NextResponse.json({ ok: true });
  }

  // Mark only standalone videos (not in any playlist) as read.
  if (standaloneOnly) {
    const standaloneRows = await prisma.standaloneVideo.findMany({
      where: {
        user_id: userId,
        video: { playlist_items: { none: { playlist: { user_id: userId } } } },
      },
      select: { video_id: true },
    });
    if (standaloneRows.length > 0) {
      await prisma.userVideoConsumption.createMany({
        data: standaloneRows.map((r) => ({ user_id: userId, video_id: r.video_id })),
        skipDuplicates: true,
      });
    }
    return NextResponse.json({ ok: true, count: standaloneRows.length });
  }

  // Mark all library videos (standalone + all playlists) as read.
  if (library) {
    // Standalone videos: bulk-create UserVideoConsumption rows.
    const standaloneRows = await prisma.standaloneVideo.findMany({
      where: { user_id: userId },
      select: { video_id: true },
    });
    if (standaloneRows.length > 0) {
      await prisma.userVideoConsumption.createMany({
        data: standaloneRows.map((r) => ({ user_id: userId, video_id: r.video_id })),
        skipDuplicates: true,
      });
    }
    // All playlists: set watermark.
    await prisma.playlist.updateMany({
      where: { user_id: userId },
      data: { read_at: now },
    });
    return NextResponse.json({ ok: true });
  }

  // Default: mark subscribed channels as read (existing behavior).
  const result = await markAllReadForUser(prisma, userId, channelId);
  if (result == null) {
    console.error(`[videos/mark-all-read/POST] Channel ${channelId} not found for user ${userId}`);
    return NextResponse.json({ error: 'Channel not found' }, { status: 404 });
  }
  return NextResponse.json({ ok: true, channels: result.channels });
}
