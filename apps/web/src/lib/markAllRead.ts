import type { PrismaClient } from '@readtube/database';

/**
 * "Mark all as read" operations that don't belong to the channel-
 * subscription flow (those live in `subscriptions.ts`). Each helper
 * below is the bare DB operation for one branch of the
 * `/api/videos/mark-all-read` endpoint; the route layer handles auth
 * + request parsing and delegates here.
 *
 * Split out so integration tests can exercise the DB effects without
 * going through the Next.js request cycle.
 */

export interface MarkLibraryReadResult {
  /** Number of StandaloneVideo rows touched (consumption rows created). */
  standaloneCount: number;
  /** Number of Playlist rows whose read_at was updated. */
  playlistCount: number;
}

/**
 * Mark every video in a single playlist as read by moving the
 * playlist's watermark to `now`. Returns `null` if the playlist
 * doesn't exist or doesn't belong to the caller (route should 404).
 */
export async function markPlaylistRead(
  prisma: PrismaClient,
  userId: string,
  playlistId: string
): Promise<{ ok: true } | null> {
  const pl = await prisma.playlist.findFirst({
    where: { id: playlistId, user_id: userId },
    select: { id: true },
  });
  if (pl == null) {
    return null;
  }
  await prisma.playlist.update({
    where: { id: pl.id },
    data: { read_at: new Date() },
  });
  return { ok: true };
}

/**
 * Mark every standalone video as read by creating UserVideoConsumption
 * rows. Returns the number of standalone rows considered — not the
 * number of consumption rows inserted, which may be smaller due to
 * `skipDuplicates`.
 */
export async function markStandaloneRead(
  prisma: PrismaClient,
  userId: string
): Promise<{ count: number }> {
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
  return { count: standaloneRows.length };
}

/**
 * Mark every library video — both the standalone list and every
 * playlist the user owns. Standalone videos get consumption rows;
 * playlists get their watermark bumped.
 */
export async function markLibraryRead(
  prisma: PrismaClient,
  userId: string
): Promise<MarkLibraryReadResult> {
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
  const playlistUpdate = await prisma.playlist.updateMany({
    where: { user_id: userId },
    data: { read_at: new Date() },
  });
  return {
    standaloneCount: standaloneRows.length,
    playlistCount: playlistUpdate.count,
  };
}
