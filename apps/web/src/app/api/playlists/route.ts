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
}

function toPlaylistData(row: {
  id: string;
  name: string;
  sort_order: number;
  _count: { items: number };
}): PlaylistData {
  return {
    id: row.id,
    name: row.name,
    sortOrder: row.sort_order,
    videoCount: row._count.items,
  };
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
      _count: { select: { items: true } },
    },
  });

  return NextResponse.json(rows.map(toPlaylistData));
}

/**
 * Add a YouTube playlist by URL. Fetches the playlist RSS feed,
 * creates a Playlist row with the title from the feed, and ingests
 * each video (shadow Channel + Video + StandaloneVideo + PlaylistVideo).
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
      const status = err.code === 'INVALID_URL' ? 400 : 502;
      return NextResponse.json({ error: err.message }, { status });
    }
    console.error('[playlists/POST] addPlaylistForUser failed:', err);
    return NextResponse.json({ error: 'Failed to add playlist' }, { status: 500 });
  }
}
