import { prisma } from '@readtube/database';
import { NextRequest, NextResponse } from 'next/server';

import { requireUserId } from '@/lib/auth';
import { ensureUserExists } from '@/lib/db/user';
import { parseInboxQuery } from '@/lib/inbox/filter';
import { loadInboxVideos } from '@/lib/inbox/loadVideos';
import { isEmptyString } from '@/lib/string';
import { AddVideoError, addVideoForUser } from '@/lib/workflows/add-video';

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

/**
 * Add an individual YouTube video to the user's library. Creates a
 * `StandaloneVideo` row; backing `Video` and `Channel` rows are
 * upserted if missing (channel is added as an unsubscribed "shadow"
 * channel that the refresh cron will ignore).
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
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const input = body.url?.trim() ?? '';
  if (isEmptyString(input)) {
    return NextResponse.json({ error: 'Missing URL' }, { status: 400 });
  }

  await ensureUserExists(userId);

  try {
    const result = await addVideoForUser({ userId, input });
    return NextResponse.json(result, { status: result.createdStandalone ? 201 : 200 });
  } catch (err) {
    if (err instanceof AddVideoError) {
      const status = err.code === 'INVALID_URL' ? 400 : 502;
      return NextResponse.json({ error: err.message }, { status });
    }
    console.error('[videos/POST] addVideoForUser failed:', err);
    return NextResponse.json({ error: 'Failed to add video' }, { status: 500 });
  }
}
