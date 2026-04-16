import type { PrismaClient } from '@readtube/database';

export interface DeletePlaylistResult {
  deleted: boolean;
  /** Number of StandaloneVideo rows cleaned up because their video
   *  no longer has any library path (no other playlist, no individual
   *  add beyond the playlist being deleted). */
  standaloneRemoved: number;
}

/**
 * Delete a user's playlist and disassociate any videos that only
 * belonged to this playlist. Specifically:
 *
 *   1. Capture the video_ids in the playlist.
 *   2. Delete the Playlist row (cascades to PlaylistVideo).
 *   3. For each captured video, check whether the user still has a
 *      PlaylistVideo for it (via any OTHER of their playlists). If not,
 *      delete the user's StandaloneVideo for that video so it no
 *      longer shows up in the library.
 *   4. Video/Channel/Transcript/etc. rows stay in the database —
 *      other users may still have access via their own subscriptions
 *      or playlists.
 *
 * Returns `{ deleted: false }` if the playlist doesn't exist or isn't
 * owned by the user.
 */
export async function deletePlaylistForUser(
  prisma: PrismaClient,
  userId: string,
  playlistId: string
): Promise<DeletePlaylistResult> {
  // 1. Verify ownership + capture video IDs.
  const playlist = await prisma.playlist.findFirst({
    where: { id: playlistId, user_id: userId },
    select: {
      id: true,
      items: { select: { video_id: true } },
    },
  });
  if (playlist == null) {
    return { deleted: false, standaloneRemoved: 0 };
  }
  const videoIds = playlist.items.map((i) => i.video_id);

  // 2. Delete the playlist. Cascade removes PlaylistVideo rows.
  await prisma.playlist.delete({ where: { id: playlist.id } });

  if (videoIds.length === 0) {
    return { deleted: true, standaloneRemoved: 0 };
  }

  // 3. Find which of these videos are still in any OTHER playlist
  //    owned by this user. Anything not in that set should lose its
  //    StandaloneVideo row (if one exists) so the video leaves the
  //    user's library entirely.
  const remainingInOtherPlaylists = await prisma.playlistVideo.findMany({
    where: {
      video_id: { in: videoIds },
      playlist: { user_id: userId },
    },
    select: { video_id: true },
  });
  const stillHasPlaylistHome = new Set(remainingInOtherPlaylists.map((r) => r.video_id));
  const orphanVideoIds = videoIds.filter((id) => !stillHasPlaylistHome.has(id));

  if (orphanVideoIds.length === 0) {
    return { deleted: true, standaloneRemoved: 0 };
  }

  const standaloneResult = await prisma.standaloneVideo.deleteMany({
    where: { user_id: userId, video_id: { in: orphanVideoIds } },
  });

  return { deleted: true, standaloneRemoved: standaloneResult.count };
}
