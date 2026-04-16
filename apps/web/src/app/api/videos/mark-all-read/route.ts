import { auth } from '@clerk/nextjs/server';
import { prisma } from '@readtube/database';
import { NextRequest, NextResponse } from 'next/server';

import { markAllReadForUser } from '@/lib/subscriptions';

export async function POST(request: NextRequest) {
  const { userId } = await auth();
  if (userId == null) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Optional body:
  //   { channelId?: string }   — mark videos in one subscribed channel
  //   { playlistId?: string }  — mark videos in one playlist (watermark)
  //   { library?: true }       — mark all standalone + playlist videos
  //   (empty)                  — mark all subscribed channels
  let channelId: string | undefined;
  let playlistId: string | undefined;
  let library = false;
  try {
    const body = (await request.json()) as {
      channelId?: unknown;
      playlistId?: unknown;
      library?: unknown;
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
  } catch {
    // Empty body — fall through to "all subscribed channels"
  }

  const now = new Date();

  // Mark a single playlist as read via watermark.
  if (playlistId != null) {
    const pl = await prisma.playlist.findFirst({
      where: { id: playlistId, user_id: userId },
      select: { id: true },
    });
    if (pl == null) {
      return NextResponse.json({ error: 'Playlist not found' }, { status: 404 });
    }
    await prisma.playlist.update({ where: { id: pl.id }, data: { read_at: now } });
    return NextResponse.json({ ok: true });
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
    return NextResponse.json({ error: 'Channel not found' }, { status: 404 });
  }
  return NextResponse.json({ ok: true, channels: result.channels });
}
