import { auth } from '@clerk/nextjs/server';
import { prisma } from '@readtube/database';
import { NextRequest, NextResponse } from 'next/server';

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
  if (sub == null) {
    return NextResponse.json({ error: 'Channel not found' }, { status: 404 });
  }

  // Collect all video IDs for this channel so we can clean up
  // user-specific data. The channel and videos themselves are shared
  // resources and remain untouched.
  const videoIds = (
    await prisma.video.findMany({
      where: { channel_id: channelId },
      select: { id: true },
    })
  ).map((v) => v.id);

  const userVideoFilter = { user_id: userId, video_id: { in: videoIds } };

  await prisma.$transaction([
    prisma.userSubscription.delete({ where: { id: sub.id } }),
    ...(videoIds.length > 0
      ? [
          prisma.userVideoConsumption.deleteMany({ where: userVideoFilter }),
          prisma.videoStar.deleteMany({ where: userVideoFilter }),
          prisma.videoSave.deleteMany({ where: userVideoFilter }),
          prisma.videoArchive.deleteMany({ where: userVideoFilter }),
          prisma.note.deleteMany({ where: userVideoFilter }),
          prisma.highlight.deleteMany({ where: userVideoFilter }),
          prisma.videoTag.deleteMany({ where: userVideoFilter }),
        ]
      : []),
  ]);

  return new NextResponse(null, { status: 204 });
}
