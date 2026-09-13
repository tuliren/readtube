import { prisma } from '@readtube/database';
import { NextRequest, NextResponse } from 'next/server';

import { requireUserId } from '@/lib/auth';
import { PrivatePlaylistError } from '@/lib/platforms/youtube/playlistScrape';
import {
  PlaylistRefreshLimitedError,
  refreshPlaylistForUser,
} from '@/lib/workflows/refresh-playlist';

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireUserId();
  if (authResult instanceof NextResponse) {
    return authResult;
  }
  const { id } = await params;
  try {
    const result = await refreshPlaylistForUser(prisma, authResult, id);
    if (result == null) {
      return NextResponse.json({ error: 'Playlist not found' }, { status: 404 });
    }
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof PlaylistRefreshLimitedError) {
      return NextResponse.json({ error: err.message }, { status: 429 });
    }
    console.error(`[playlists/refresh] Failed to refresh playlist ${id}:`, err);
    if (err instanceof PrivatePlaylistError) {
      return NextResponse.json({ error: 'This playlist is private.' }, { status: 400 });
    }
    return NextResponse.json({ error: 'Failed to refresh playlist. Try again.' }, { status: 502 });
  }
}
