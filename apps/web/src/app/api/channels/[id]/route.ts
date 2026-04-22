import { auth } from '@clerk/nextjs/server';
import { prisma } from '@readtube/database';
import { NextRequest, NextResponse } from 'next/server';

import { unsubscribeChannelForUser } from '@/lib/subscriptions';

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (userId == null) {
    console.error('[channels/DELETE] Unauthorized');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const channelId = id;

  console.info(`[channels/DELETE] Unsubscribing channel ${channelId} for user ${userId}`);

  const result = await unsubscribeChannelForUser(prisma, userId, channelId);
  if (result == null) {
    console.error(`[channels/DELETE] Channel ${channelId} not subscribed by user ${userId}`);
    return NextResponse.json({ error: 'Channel not found' }, { status: 404 });
  }

  return new NextResponse(null, { status: 204 });
}
