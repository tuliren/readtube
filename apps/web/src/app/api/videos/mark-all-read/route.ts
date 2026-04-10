import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';

import { prisma } from '@/lib/db';

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

  const now = new Date();

  if (channelId != null) {
    // Single channel: validate ownership, then bump that subscription's watermark.
    const sub = await prisma.userSubscription.findFirst({
      where: { user_id: userId, channel_id: channelId },
      select: { id: true },
    });
    if (sub == null) {
      return NextResponse.json({ error: 'Channel not found' }, { status: 404 });
    }
    await prisma.userSubscription.update({
      where: { id: sub.id },
      data: { read_at: now },
    });
    return NextResponse.json({ ok: true });
  }

  // All subscribed channels: bump every watermark in one statement.
  const result = await prisma.userSubscription.updateMany({
    where: { user_id: userId },
    data: { read_at: now },
  });
  return NextResponse.json({ ok: true, channels: result.count });
}
