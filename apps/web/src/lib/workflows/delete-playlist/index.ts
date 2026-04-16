import type { PrismaClient } from '@readtube/database';

export interface DeletePlaylistResult {
  deleted: boolean;
}

/**
 * Delete a user's playlist. Cascade removes PlaylistVideo rows. Any
 * StandaloneVideo rows the user has are left alone — they represent
 * explicit individual additions (the add-playlist flow does not
 * create StandaloneVideo rows automatically). Video/Channel rows
 * stay in the database — other users may still have access via
 * their own subscriptions or playlists.
 *
 * Returns `{ deleted: false }` if the playlist doesn't exist or isn't
 * owned by the user.
 */
export async function deletePlaylistForUser(
  prisma: PrismaClient,
  userId: string,
  playlistId: string
): Promise<DeletePlaylistResult> {
  const existing = await prisma.playlist.findFirst({
    where: { id: playlistId, user_id: userId },
    select: { id: true },
  });
  if (existing == null) {
    return { deleted: false };
  }
  await prisma.playlist.delete({ where: { id: existing.id } });
  return { deleted: true };
}
