import { Prisma, prisma } from '@readtube/database';
import { NextRequest, NextResponse } from 'next/server';

import { requireUserId } from '@/lib/auth';

interface Params {
  params: Promise<{ id: string }>;
}

/**
 * Add a video to a playlist. Playlist membership implies the
 * video is part of the user's personal library.
 */
export async function POST(request: NextRequest, { params }: Params) {
  const authResult = await requireUserId();
  if (authResult instanceof NextResponse) {
    return authResult;
  }
  const userId = authResult;
  const { id: playlistId } = await params;

  let body: { videoId?: string };
  try {
    body = await request.json();
  } catch (err) {
    console.error('[playlists/videos/POST] Invalid body:', err);
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }
  const videoId = body.videoId?.trim() ?? '';
  if (videoId.length === 0) {
    console.error('[playlists/videos/POST] videoId required');
    return NextResponse.json({ error: 'videoId required' }, { status: 400 });
  }

  console.info(
    `[playlists/videos/POST] Adding video ${videoId} to playlist ${playlistId} for user ${userId}`
  );

  const playlist = await prisma.playlist.findFirst({
    where: { id: playlistId, user_id: userId },
    select: { id: true },
  });
  if (playlist == null) {
    console.error(`[playlists/videos/POST] Playlist ${playlistId} not found for user ${userId}`);
    return NextResponse.json({ error: 'Playlist not found' }, { status: 404 });
  }

  const video = await prisma.video.findUnique({ where: { id: videoId }, select: { id: true } });
  if (video == null) {
    console.error(`[playlists/videos/POST] Video ${videoId} not found`);
    return NextResponse.json({ error: 'Video not found' }, { status: 404 });
  }

  await prisma.playlistVideo.upsert({
    where: {
      playlist_video_unique_playlist_video: { playlist_id: playlistId, video_id: videoId },
    },
    create: { playlist_id: playlistId, video_id: videoId },
    update: {},
  });

  return NextResponse.json({ added: true }, { status: 201 });
}

/**
 * Remove a video from a playlist. Does NOT remove the backing
 * `StandaloneVideo` — a video can live in "All" without belonging to
 * any playlist.
 */
export async function DELETE(request: NextRequest, { params }: Params) {
  const authResult = await requireUserId();
  if (authResult instanceof NextResponse) {
    return authResult;
  }
  const userId = authResult;
  const { id: playlistId } = await params;

  const videoId = request.nextUrl.searchParams.get('videoId')?.trim() ?? '';
  if (videoId.length === 0) {
    console.error('[playlists/videos/DELETE] videoId query param required');
    return NextResponse.json({ error: 'videoId query param required' }, { status: 400 });
  }

  console.info(
    `[playlists/videos/DELETE] Removing video ${videoId} from playlist ${playlistId} for user ${userId}`
  );

  const playlist = await prisma.playlist.findFirst({
    where: { id: playlistId, user_id: userId },
    select: { id: true },
  });
  if (playlist == null) {
    console.error(`[playlists/videos/DELETE] Playlist ${playlistId} not found for user ${userId}`);
    return NextResponse.json({ error: 'Playlist not found' }, { status: 404 });
  }

  try {
    await prisma.playlistVideo.delete({
      where: {
        playlist_video_unique_playlist_video: { playlist_id: playlistId, video_id: videoId },
      },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
      console.error(`[playlists/videos/DELETE] Video ${videoId} not in playlist ${playlistId}`);
      return NextResponse.json({ error: 'Not in playlist' }, { status: 404 });
    }
    throw err;
  }

  return NextResponse.json({ removed: true });
}
