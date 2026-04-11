import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';

import { prisma } from '@/lib/db';

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (userId == null) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const channelId = id;

  // IDOR check: ensure user is subscribed to this channel
  const sub = await prisma.userSubscription.findFirst({
    where: { channel_id: channelId, user_id: userId },
  });
  if (!sub) {
    return NextResponse.json({ error: 'Channel not found' }, { status: 404 });
  }

  await prisma.userSubscription.delete({ where: { id: sub.id } });

  return new NextResponse(null, { status: 204 });
}
