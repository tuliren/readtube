import { prisma } from '@readtube/database';
import { NextResponse } from 'next/server';

import { requireUserId } from '@/lib/auth';
import { effectivePublishDate } from '@/lib/subscriptions';

/**
 * Returns the unread count for the Standalone library view.
 *
 * Library membership is the union of:
 *   - StandaloneVideo (user explicitly added the video)
 *   - PlaylistVideo where playlist is owned by the user
 *
 * Read state uses two mechanisms:
 *   - UserVideoConsumption row (user opened the video)
 *   - Playlist watermark: video's published_at <= playlist.read_at
 *
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

  if (standaloneIds.size === 0) {
    return NextResponse.json({ standaloneUnread: 0 });
  }

  // Consumption lookup is scoped to the standalone candidates — the
  // playlist-only ids don't affect the Standalone count.
  const standaloneIdList: string[] = [];
  standaloneIds.forEach((id) => standaloneIdList.push(id));
  const consumedRows = await prisma.userVideoConsumption.findMany({
    where: { user_id: userId, video_id: { in: standaloneIdList } },
    select: { video_id: true },
  });
  const consumedIds = new Set(consumedRows.map((r) => r.video_id));

  // Playlist watermark coverage — a standalone video might simultaneously
  // live in a playlist (in which case it isn't counted toward Standalone
  // below anyway), but keep the check consistent with /videos/standalone.
  const playlists = await prisma.playlist.findMany({
    where: { user_id: userId, read_at: { not: null } },
    select: {
      read_at: true,
      items: {
        select: {
          video_id: true,
          video: { select: { published_at: true, created_at: true } },
        },
      },
    },
  });
  const watermarkReadIds = new Set<string>();
  for (const pl of playlists) {
    if (pl.read_at == null) {
      continue;
    }
    for (const item of pl.items) {
      if (effectivePublishDate(item.video) <= pl.read_at) {
        watermarkReadIds.add(item.video_id);
      }
    }
  }

  const isRead = (id: string) => consumedIds.has(id) || watermarkReadIds.has(id);

  // Standalone = StandaloneVideo rows not also in any of the user's playlists.
  let standaloneUnread = 0;
  standaloneIds.forEach((id) => {
    if (!isRead(id) && !inPlaylistIds.has(id)) {
      standaloneUnread++;
    }
  });

  return NextResponse.json({ standaloneUnread });
}
