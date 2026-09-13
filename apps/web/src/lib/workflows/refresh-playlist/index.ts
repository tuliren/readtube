import type { PrismaClient } from '@readtube/database';

import { MANUAL_REFRESH_DAYS } from '@/lib/channels/staleness';
import { isProduction } from '@/lib/vercelEnv';
import { fetchPlaylistData } from '@/lib/workflows/add-playlist';
import { persistPlaylistVideos } from '@/lib/workflows/add-playlist/persistPlaylistVideos';

const REFRESH_CLAIM_MS = 10 * 60 * 1000;

export class PlaylistRefreshLimitedError extends Error {}

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
  // Claim before calling the upstream service. The conditional update prevents
  // concurrent requests from both passing the cooldown check. Abandoned claims
  // expire; failure releases the claim without advancing the successful timestamp.
  const claim = await prisma.playlist.updateMany({
    where: {
      id: playlistId,
      user_id: userId,
      AND: [
        {
          OR: [
            { refresh_started_at: null },
            { refresh_started_at: { lte: new Date(startedAt.getTime() - REFRESH_CLAIM_MS) } },
          ],
        },
        ...(isProduction()
          ? [{ OR: [{ checked_at: null }, { checked_at: { lte: cutoff } }] }]
          : []),
      ],
    },
    data: { refresh_started_at: startedAt },
  });
  if (claim.count === 0) {
    throw new PlaylistRefreshLimitedError(
      'Refresh already in progress or completed within the last 24 hours. Please try again later.'
    );
  }

  try {
    const feed = await fetchPlaylistData(playlist.source_id);
    return await prisma.$transaction(
      async (tx) => {
        // Lock and recheck the claim: a deleted playlist or an expired claim
        // taken over by another request must not receive this stale response.
        const updated = await tx.playlist.updateMany({
          where: { id: playlistId, user_id: userId, refresh_started_at: startedAt },
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
        await tx.playlist.update({
          where: { id: playlistId },
          data: { checked_at: new Date(), refresh_started_at: null },
        });
        return { videosProcessed };
      },
      { timeout: 60_000 }
    );
  } finally {
    await prisma.playlist.updateMany({
      where: { id: playlistId, user_id: userId, refresh_started_at: startedAt },
      data: { refresh_started_at: null },
    });
  }
}
