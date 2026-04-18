import { prisma } from '@readtube/database';
import { NextResponse } from 'next/server';

import { requireUserId } from '@/lib/auth';

interface Params {
  params: Promise<{ id: string }>;
}

/**
 * Remove a video from the user's personal library. Deletes the
 * `StandaloneVideo` row AND clears the video from every one of the
 * user's playlists (cascade via `PlaylistVideo` scoped to the
 * user's playlists), so a single action removes the video from the
 * Videos sidebar entirely.
 *
 * Idempotent: a second DELETE is a no-op and returns 200.
 */
export async function DELETE(_request: Request, { params }: Params) {
  const authResult = await requireUserId();
  if (authResult instanceof NextResponse) {
    return authResult;
  }
  const userId = authResult;
  const { id: videoId } = await params;

  console.info(
    `[videos/standalone/DELETE] Removing video ${videoId} from library for user ${userId}`
  );

  // Remove from every one of the user's playlists AND delete the
  // StandaloneVideo row in a single round-trip. Both operations are
  // scoped to this user, so there is no IDOR risk even if the caller
  // passes a videoId they do not own — the writes become no-ops.
  await prisma.$transaction([
    prisma.playlistVideo.deleteMany({
      where: {
        video_id: videoId,
        playlist: { user_id: userId },
      },
    }),
    prisma.standaloneVideo.deleteMany({
      where: { user_id: userId, video_id: videoId },
    }),
  ]);

  return NextResponse.json({ removed: true });
}
