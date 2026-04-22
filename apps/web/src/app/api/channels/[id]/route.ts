import { auth } from '@clerk/nextjs/server';
import { prisma } from '@readtube/database';
import { NextRequest, NextResponse } from 'next/server';

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

  // IDOR check: ensure user is subscribed to this channel
  const sub = await prisma.userSubscription.findFirst({
    where: { channel_id: channelId, user_id: userId },
  });
  if (sub == null) {
    console.error(`[channels/DELETE] Channel ${channelId} not subscribed by user ${userId}`);
    return NextResponse.json({ error: 'Channel not found' }, { status: 404 });
  }

  // Collect all video IDs for this channel so we can clean up
  // user-specific data. The channel and videos themselves are shared
  // resources and remain untouched.
  const channelVideoIds = (
    await prisma.video.findMany({
      where: { channel_id: channelId },
      select: { id: true },
    })
  ).map((v) => v.id);

  // Videos the user is keeping in their library for reasons other than
  // this subscription — standalone adds and playlist membership. Their
  // triage state (read / star / save / archive / notes) must survive
  // the unsubscribe so the video keeps its context in the Videos
  // sidebar and any playlists it belongs to.
  const retainedVideoIds =
    channelVideoIds.length > 0
      ? new Set(
          (
            await Promise.all([
              prisma.standaloneVideo.findMany({
                where: { user_id: userId, video_id: { in: channelVideoIds } },
                select: { video_id: true },
              }),
              prisma.playlistVideo.findMany({
                where: {
                  video_id: { in: channelVideoIds },
                  playlist: { user_id: userId },
                },
                select: { video_id: true },
              }),
            ])
          )
            .flat()
            .map((row) => row.video_id)
        )
      : new Set<string>();

  const videoIdsToCleanup = channelVideoIds.filter((id) => !retainedVideoIds.has(id));
  const userVideoFilter = { user_id: userId, video_id: { in: videoIdsToCleanup } };

  await prisma.$transaction([
    prisma.userSubscription.delete({ where: { id: sub.id } }),
    ...(videoIdsToCleanup.length > 0
      ? [
          prisma.userVideoConsumption.deleteMany({ where: userVideoFilter }),
          prisma.videoStar.deleteMany({ where: userVideoFilter }),
          prisma.videoSave.deleteMany({ where: userVideoFilter }),
          prisma.videoArchive.deleteMany({ where: userVideoFilter }),
          prisma.note.deleteMany({ where: userVideoFilter }),
        ]
      : []),
  ]);

  return new NextResponse(null, { status: 204 });
}
