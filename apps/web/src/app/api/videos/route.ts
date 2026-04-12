import { prisma } from '@readtube/database';
import { NextRequest, NextResponse } from 'next/server';

import { requireUserId } from '@/lib/auth';
import { parseInboxQuery } from '@/lib/inbox/filter';
import { loadInboxVideos } from '@/lib/inbox/loadVideos';

export async function GET(request: NextRequest) {
  const authResult = await requireUserId();
  if (authResult instanceof NextResponse) {
    return authResult;
  }
  const userId = authResult;

  const query = parseInboxQuery(request.nextUrl.searchParams);

  // 404 on a channelId that doesn't belong to this user — kept here as
  // a route-level concern (the helper silently widens to the user's
  // full channel set, which is the correct behavior for SSR but not
  // for an explicit API call).
  if (query.channelId != null) {
    const owns = await prisma.userSubscription.findFirst({
      where: { user_id: userId, channel_id: query.channelId },
      select: { channel_id: true },
    });
    if (owns == null) {
      return NextResponse.json({ error: 'Channel not found' }, { status: 404 });
    }
  }

  const videos = await loadInboxVideos(prisma, userId, query);
  return NextResponse.json(videos);
}
