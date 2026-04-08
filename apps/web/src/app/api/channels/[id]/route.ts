import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';

import { prisma } from '@/lib/db';

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const channelId = id;

  // IDOR check: ensure channel belongs to this user
  const channel = await prisma.channel.findFirst({
    where: { id: channelId, user_id: userId },
  });
  if (!channel) {
    return NextResponse.json({ error: 'Channel not found' }, { status: 404 });
  }

  await prisma.channel.delete({ where: { id: channelId } });

  return new NextResponse(null, { status: 204 });
}
