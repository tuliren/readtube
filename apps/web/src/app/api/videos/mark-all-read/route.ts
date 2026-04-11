import { auth } from '@clerk/nextjs/server';
import { prisma } from '@readtube/database';
import { NextRequest, NextResponse } from 'next/server';

import { markAllReadForUser } from '@/lib/subscriptions';

export async function POST(request: NextRequest) {
  const { userId } = await auth();
  if (userId == null) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Optional body: { channelId?: string } — if provided, only mark videos in that channel.
  let channelId: string | undefined;
  try {
    const body = (await request.json()) as { channelId?: unknown };
    if (typeof body.channelId === 'string') {
      channelId = body.channelId;
    }
  } catch {
    // Empty body — fall through to "all subscribed channels"
  }

  const result = await markAllReadForUser(prisma, userId, channelId);
  if (result == null) {
    return NextResponse.json({ error: 'Channel not found' }, { status: 404 });
  }
  return NextResponse.json({ ok: true, channels: result.channels });
}
