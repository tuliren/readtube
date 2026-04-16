import { prisma } from '@readtube/database';
import { NextResponse } from 'next/server';

import { requireUserId } from '@/lib/auth';

/**
 * Returns unread counts for the "All" and "Standalone" library views.
 *
 * Read state uses two mechanisms (same dual model as channels):
 *   - Standalone videos (not in any playlist): read if a
 *     UserVideoConsumption row exists for the user+video.
 *   - Playlist videos: read if the video's published_at <= the
 *     playlist's read_at watermark, OR a UserVideoConsumption row
 *     exists.
 *
 * "All" = every StandaloneVideo the user has. "Standalone" = those
 * not in any of the user's playlists.
 */
export async function GET() {
  const authResult = await requireUserId();
  if (authResult instanceof NextResponse) {
    return authResult;
  }
  const userId = authResult;

  // All library video IDs.
  const standaloneRows = await prisma.standaloneVideo.findMany({
    where: { user_id: userId },
    select: { video_id: true },
  });
  if (standaloneRows.length === 0) {
    return NextResponse.json({ allUnread: 0, standaloneUnread: 0 });
  }

  const allVideoIds = standaloneRows.map((r) => r.video_id);

  // Per-video consumption rows (covers standalone + any playlist
  // video the user explicitly opened).
  const consumedRows = await prisma.userVideoConsumption.findMany({
    where: { user_id: userId, video_id: { in: allVideoIds } },
    select: { video_id: true },
  });
  const consumedIds = new Set(consumedRows.map((r) => r.video_id));

  // Playlist watermarks: video IDs covered by each playlist's read_at.
  const playlists = await prisma.playlist.findMany({
    where: { user_id: userId, read_at: { not: null } },
    select: {
      read_at: true,
      items: { select: { video_id: true, video: { select: { published_at: true } } } },
    },
  });
  const watermarkReadIds = new Set<string>();
  for (const pl of playlists) {
    if (pl.read_at == null) {
      continue;
    }
    for (const item of pl.items) {
      if (item.video.published_at <= pl.read_at) {
        watermarkReadIds.add(item.video_id);
      }
    }
  }

  const isRead = (id: string) => consumedIds.has(id) || watermarkReadIds.has(id);
  const allUnread = allVideoIds.filter((id) => !isRead(id)).length;

  // Standalone = not in any of the user's playlists.
  const inPlaylistRows = await prisma.playlistVideo.findMany({
    where: { video_id: { in: allVideoIds }, playlist: { user_id: userId } },
    select: { video_id: true },
  });
  const inPlaylistIds = new Set(inPlaylistRows.map((r) => r.video_id));
  const standaloneUnread = allVideoIds.filter((id) => !isRead(id) && !inPlaylistIds.has(id)).length;

  return NextResponse.json({ allUnread, standaloneUnread });
}
