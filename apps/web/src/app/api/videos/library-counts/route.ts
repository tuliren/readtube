import { prisma } from '@readtube/database';
import { NextResponse } from 'next/server';

import { requireUserId } from '@/lib/auth';

/**
 * Returns unread counts for the "All" and "Standalone" library views.
 * A video is unread if the user has a StandaloneVideo row for it but
 * no UserVideoConsumption row.
 */
export async function GET() {
  const authResult = await requireUserId();
  if (authResult instanceof NextResponse) {
    return authResult;
  }
  const userId = authResult;

  const standaloneRows = await prisma.standaloneVideo.findMany({
    where: { user_id: userId },
    select: { video_id: true },
  });
  if (standaloneRows.length === 0) {
    return NextResponse.json({ allUnread: 0, standaloneUnread: 0 });
  }

  const allVideoIds = standaloneRows.map((r) => r.video_id);
  const consumedRows = await prisma.userVideoConsumption.findMany({
    where: { user_id: userId, video_id: { in: allVideoIds } },
    select: { video_id: true },
  });
  const consumedIds = new Set(consumedRows.map((r) => r.video_id));

  const allUnread = allVideoIds.filter((id) => !consumedIds.has(id)).length;

  // Standalone = not in any of the user's playlists.
  const inPlaylistRows = await prisma.playlistVideo.findMany({
    where: {
      video_id: { in: allVideoIds },
      playlist: { user_id: userId },
    },
    select: { video_id: true },
  });
  const inPlaylistIds = new Set(inPlaylistRows.map((r) => r.video_id));
  const standaloneUnread = allVideoIds.filter(
    (id) => !consumedIds.has(id) && !inPlaylistIds.has(id)
  ).length;

  return NextResponse.json({ allUnread, standaloneUnread });
}
