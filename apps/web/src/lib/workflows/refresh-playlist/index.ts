import type { PrismaClient } from '@readtube/database';

import { fetchPlaylistData } from '@/lib/workflows/add-playlist';
import { persistPlaylistVideos } from '@/lib/workflows/add-playlist/persistPlaylistVideos';

/**
 * Refresh an owned playlist in place. The source can return a partial feed,
 * so keep existing entries and append missing ones. Preserve read state,
 * custom names, and manual ordering. Fetch before opening the transaction.
 */
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

  const feed = await fetchPlaylistData(playlist.source_id);

  return prisma.$transaction(
    async (tx) => {
      // This update also locks the playlist row, serializing concurrent
      // refreshes before assigning positions to new entries. Recheck ownership
      // in case the playlist was deleted while the source was being fetched.
      const updated = await tx.playlist.updateMany({
        where: { id: playlistId, user_id: userId },
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
