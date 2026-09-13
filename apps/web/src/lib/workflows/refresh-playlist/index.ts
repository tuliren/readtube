import type { PrismaClient } from '@readtube/database';

import { MANUAL_REFRESH_DAYS } from '@/lib/channels/staleness';
import { isDevelopment } from '@/lib/vercelEnv';
import { fetchPlaylistData } from '@/lib/workflows/add-playlist';
import { persistPlaylistVideos } from '@/lib/workflows/add-playlist/persistPlaylistVideos';

export class PlaylistRefreshLimitedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PlaylistRefreshLimitedError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** Refresh an owned playlist without changing its read state or existing order. */
export async function refreshPlaylistForUser(
  prisma: PrismaClient,
  userId: string,
  playlistId: string
): Promise<{ videosProcessed: number } | null> {
  const playlist = await prisma.playlist.findFirst({
    where: { id: playlistId, user_id: userId },
    select: { source_id: true },
  });
  if (playlist == null) {
    return null;
  }

  const startedAt = new Date();
  const cutoff = new Date(startedAt.getTime() - MANUAL_REFRESH_DAYS * 24 * 60 * 60 * 1000);
  // Reserve the 24-hour allowance before fetching. The conditional update
  // admits only one staging or production request, and failures keep the timestamp.
  const claim = await prisma.playlist.updateMany({
    where: {
      id: playlistId,
      user_id: userId,
      ...(!isDevelopment() ? { OR: [{ checked_at: null }, { checked_at: { lte: cutoff } }] } : {}),
    },
    data: { checked_at: startedAt },
  });
  if (claim.count === 0) {
    throw new PlaylistRefreshLimitedError(
      'A playlist refresh was attempted within the last 24 hours. Please try again later.'
    );
  }

  const feed = await fetchPlaylistData(playlist.source_id);
  return prisma.$transaction(
    async (tx) => {
      // Lock and verify this attempt still owns the timestamp before writing.
      // A deleted playlist or a newer attempt must not receive stale results.
      const updated = await tx.playlist.updateMany({
        where: { id: playlistId, user_id: userId, checked_at: startedAt },
        data: { fetched_via: feed.fetchedVia },
      });
      if (updated.count === 0) {
        return null;
      }
      const max = await tx.playlistVideo.aggregate({
        where: { playlist_id: playlistId },
        _max: { sort_order: true },
      });
      const videosProcessed = await persistPlaylistVideos(
        tx,
        playlistId,
        feed,
        (max._max.sort_order ?? -1) + 1
      );
      return { videosProcessed };
    },
    { timeout: 60_000 }
  );
}
