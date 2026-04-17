import { prisma } from '@readtube/database';
import { NextResponse } from 'next/server';

import { requireUserId } from '@/lib/auth';

/**
 * Returns unread counts for the "All" and "Standalone" library views.
 *
 * Library membership is the union of:
 *   - StandaloneVideo (user explicitly added the video)
 *   - PlaylistVideo where playlist is owned by the user
 *
 * Read state uses two mechanisms:
 *   - UserVideoConsumption row (user opened the video)
 *   - Playlist watermark: video's published_at <= playlist.read_at
 *
 * "All" counts every library video that's unread.
 * "Standalone" counts StandaloneVideo rows whose video isn't in any
 * of the user's playlists AND is unread.
 */
export async function GET() {
  const authResult = await requireUserId();
  if (authResult instanceof NextResponse) {
    return authResult;
  }
  const userId = authResult;

  console.info(`[videos/library-counts/GET] Counting library unread for user ${userId}`);

  const [standaloneRows, playlistItemRows] = await Promise.all([
    prisma.standaloneVideo.findMany({
      where: { user_id: userId },
      select: { video_id: true },
    }),
    prisma.playlistVideo.findMany({
      where: { playlist: { user_id: userId } },
      select: { video_id: true },
    }),
  ]);

  const standaloneIds = new Set(standaloneRows.map((r) => r.video_id));
  const inPlaylistIds = new Set(playlistItemRows.map((r) => r.video_id));

  // All library video IDs = standalone ∪ playlist-items.
  const allIdsSet = new Set<string>();
  standaloneIds.forEach((id) => allIdsSet.add(id));
  inPlaylistIds.forEach((id) => allIdsSet.add(id));
  const allVideoIds: string[] = [];
  allIdsSet.forEach((id) => allVideoIds.push(id));
  if (allVideoIds.length === 0) {
    return NextResponse.json({ allUnread: 0, standaloneUnread: 0 });
  }

  const consumedRows = await prisma.userVideoConsumption.findMany({
    where: { user_id: userId, video_id: { in: allVideoIds } },
    select: { video_id: true },
  });
  const consumedIds = new Set(consumedRows.map((r) => r.video_id));

  // Playlist watermark coverage.
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
      // Watermark comparison needs a real published_at; skip nulls.
      // A UserVideoConsumption row still counts these as read via
      // the consumedIds check in `isRead` below.
      if (item.video.published_at != null && item.video.published_at <= pl.read_at) {
        watermarkReadIds.add(item.video_id);
      }
    }
  }

  const isRead = (id: string) => consumedIds.has(id) || watermarkReadIds.has(id);
  const allUnread = allVideoIds.filter((id) => !isRead(id)).length;

  // Standalone = StandaloneVideo rows not also in any of the user's playlists.
  let standaloneUnread = 0;
  standaloneIds.forEach((id) => {
    if (!isRead(id) && !inPlaylistIds.has(id)) {
      standaloneUnread++;
    }
  });

  return NextResponse.json({ allUnread, standaloneUnread });
}
