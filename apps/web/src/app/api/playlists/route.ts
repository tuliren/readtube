import { prisma } from '@readtube/database';
import { NextRequest, NextResponse } from 'next/server';

import { requireUserId } from '@/lib/auth';
import { ensureUserExists } from '@/lib/db/user';
import { isEmptyString } from '@/lib/string';
import { AddPlaylistError, addPlaylistForUser } from '@/lib/workflows/add-playlist';

export interface PlaylistData {
  id: string;
  name: string;
  sortOrder: number;
  videoCount: number;
  unreadCount: number;
  thumbnailUrl: string | null;
}

export async function GET() {
  const authResult = await requireUserId();
  if (authResult instanceof NextResponse) {
    return authResult;
  }
  const userId = authResult;

  const rows = await prisma.playlist.findMany({
    where: { user_id: userId },
    orderBy: [{ sort_order: 'asc' }, { name: 'asc' }],
    select: {
      id: true,
      name: true,
      sort_order: true,
      read_at: true,
      _count: { select: { items: true } },
      items: {
        orderBy: { sort_order: 'asc' },
        take: 1,
        select: { video: { select: { thumbnail_url: true } } },
      },
    },
  });

  // Count unread videos per playlist. A video is unread iff:
  //   - it has no UserVideoConsumption row for this user, AND
  //   - the playlist has no watermark, OR the video's published_at > read_at.
  // The consumption check ensures videos the user explicitly opened
  // are counted as read even when the watermark predates them.
  const playlists: PlaylistData[] = await Promise.all(
    rows.map(async (row) => {
      const unreadCount = await prisma.playlistVideo.count({
        where: {
          playlist_id: row.id,
          video: {
            consumptions: { none: { user_id: userId } },
            ...(row.read_at != null ? { published_at: { gt: row.read_at } } : {}),
          },
        },
      });
      return {
        id: row.id,
        name: row.name,
        sortOrder: row.sort_order,
        videoCount: row._count.items,
        unreadCount,
        thumbnailUrl: row.items[0]?.video.thumbnail_url ?? null,
      };
    })
  );

  return NextResponse.json(playlists);
}

/**
 * Add a YouTube playlist by URL. Fetches the playlist RSS feed (or
 * falls back to scraping the playlist page), creates a Playlist row
 * with the title from the feed, and ingests each video (shadow
 * Channel + Video + PlaylistVideo).
 */
export async function POST(request: NextRequest) {
  const authResult = await requireUserId();
  if (authResult instanceof NextResponse) {
    return authResult;
  }
  const userId = authResult;

  let body: { url?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }
  const input = body.url?.trim() ?? '';
  if (isEmptyString(input)) {
    return NextResponse.json({ error: 'Missing URL' }, { status: 400 });
  }

  await ensureUserExists(userId);

  try {
    const result = await addPlaylistForUser({ userId, input });
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    if (err instanceof AddPlaylistError) {
      // 400 for user-fixable inputs (invalid URL, private playlist),
      // 502 for upstream fetch failures.
      const status = err.code === 'INVALID_URL' || err.code === 'PRIVATE_PLAYLIST' ? 400 : 502;
      return NextResponse.json({ error: err.message, code: err.code }, { status });
    }
    console.error('[playlists/POST] addPlaylistForUser failed:', err);
    return NextResponse.json({ error: 'Failed to add playlist' }, { status: 500 });
  }
}
