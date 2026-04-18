import { VideoPlatformType, prisma } from '@readtube/database';
import { NextRequest, NextResponse } from 'next/server';

import { requireUserId } from '@/lib/auth';

/**
 * Lightweight lookup for a video's display metadata, keyed by the
 * YouTube source_id (the value used in the /videos/[videoId] URL).
 * Used by the mobile top bar to show the current video's title —
 * the page itself is server-rendered, but the top bar lives in the
 * dashboard shell and needs a client-side signal.
 *
 * Access mirrors the reader: channel subscription, standalone, or
 * the video is in one of the user's playlists.
 */
export async function GET(request: NextRequest) {
  const authResult = await requireUserId();
  if (authResult instanceof NextResponse) {
    return authResult;
  }
  const userId = authResult;

  const sourceId = request.nextUrl.searchParams.get('sourceId');
  if (sourceId == null || sourceId.length === 0) {
    console.error('[videos/meta/GET] Missing sourceId query param');
    return NextResponse.json({ error: 'sourceId is required' }, { status: 400 });
  }

  console.info(`[videos/meta/GET] Looking up video meta for sourceId=${sourceId}, user ${userId}`);

  const video = await prisma.video.findFirst({
    where: {
      source_type: VideoPlatformType.YOUTUBE,
      source_id: sourceId,
      OR: [
        { channel: { subscriptions: { some: { user_id: userId } } } },
        { standalone: { some: { user_id: userId } } },
        { playlist_items: { some: { playlist: { user_id: userId } } } },
      ],
    },
    select: {
      id: true,
      source_id: true,
      title: true,
      channel: { select: { name: true, source_id: true } },
    },
  });
  if (video == null) {
    console.error(`[videos/meta/GET] Video not found for sourceId=${sourceId}, user ${userId}`);
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  return NextResponse.json({
    id: video.id,
    sourceId: video.source_id,
    title: video.title,
    channelName: video.channel.name,
    channelSourceId: video.channel.source_id,
  });
}
