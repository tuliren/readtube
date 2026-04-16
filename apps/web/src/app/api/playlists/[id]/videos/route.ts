import { Prisma, prisma } from '@readtube/database';
import { NextRequest, NextResponse } from 'next/server';

import { requireUserId } from '@/lib/auth';

interface Params {
  params: Promise<{ id: string }>;
}

/**
 * Add a video to a playlist. Also implicitly adds a `StandaloneVideo`
 * row if one doesn't already exist — playlist membership implies the
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
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }
  const videoId = body.videoId?.trim() ?? '';
  if (videoId.length === 0) {
    return NextResponse.json({ error: 'videoId required' }, { status: 400 });
  }

  const playlist = await prisma.playlist.findFirst({
    where: { id: playlistId, user_id: userId },
    select: { id: true },
  });
  if (playlist == null) {
    return NextResponse.json({ error: 'Playlist not found' }, { status: 404 });
  }

  const video = await prisma.video.findUnique({ where: { id: videoId }, select: { id: true } });
  if (video == null) {
    return NextResponse.json({ error: 'Video not found' }, { status: 404 });
  }

  // Playlist membership alone grants library access — no implicit
  // StandaloneVideo row. This way, deleting the playlist removes the
  // video from library views unless the user also added it individually.
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
    return NextResponse.json({ error: 'videoId query param required' }, { status: 400 });
  }

  const playlist = await prisma.playlist.findFirst({
    where: { id: playlistId, user_id: userId },
    select: { id: true },
  });
  if (playlist == null) {
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
      return NextResponse.json({ error: 'Not in playlist' }, { status: 404 });
    }
    throw err;
  }

  return NextResponse.json({ removed: true });
}
