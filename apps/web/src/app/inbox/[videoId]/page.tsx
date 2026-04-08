import { auth } from '@clerk/nextjs/server';
import { notFound, redirect } from 'next/navigation';

import InboxShell from '@/components/inbox/InboxShell';
import VideoReader from '@/components/reader/VideoReader';
import { prisma } from '@/lib/db';
import type { ChannelData, VideoData } from '@/lib/types';

interface Props {
  params: Promise<{ videoId: string }>;
  searchParams: Promise<{ channel?: string }>;
}

export default async function VideoPage({ params, searchParams }: Props) {
  const { userId } = await auth();
  if (!userId) {
    redirect('/');
  }

  const { videoId: videoDbId } = await params;
  const { channel: channelParam } = await searchParams;
  const selectedChannelId = channelParam ?? null;

  // Fetch the video with IDOR check
  const video = await prisma.video.findFirst({
    where: { id: BigInt(videoDbId), channel: { userId } },
    select: {
      id: true,
      videoId: true,
      title: true,
      description: true,
      publishedAt: true,
      readAt: true,
      channelId: true,
      channel: { select: { name: true, channelId: true } },
    },
  });

  if (!video) {
    notFound();
  }

  // Mark as read immediately (idempotent)
  if (video.readAt === null) {
    await prisma.video.update({
      where: { id: video.id },
      data: { readAt: new Date() },
    });
  }

  const videoData: VideoData = {
    id: video.id.toString(),
    videoId: video.videoId,
    title: video.title,
    description: video.description,
    publishedAt: video.publishedAt.toISOString(),
    readAt: video.readAt ? video.readAt.toISOString() : new Date().toISOString(),
    channelId: video.channelId.toString(),
    channelName: video.channel.name,
    channelYtId: video.channel.channelId,
  };

  // Fetch channels with unread counts for sidebar
  const channelRows = await prisma.channel.findMany({
    where: { userId },
    select: {
      id: true,
      channelId: true,
      name: true,
      rssUrl: true,
      createdAt: true,
      _count: { select: { videos: { where: { readAt: null } } } },
    },
    orderBy: { name: 'asc' },
  });

  const channels: ChannelData[] = channelRows.map((c) => ({
    id: c.id.toString(),
    channelId: c.channelId,
    name: c.name,
    rssUrl: c.rssUrl,
    createdAt: c.createdAt.toISOString(),
    unreadCount: c._count.videos,
  }));

  const userChannelIds = channelRows.map((c) => c.id);
  const whereClause =
    selectedChannelId && userChannelIds.some((id) => id.toString() === selectedChannelId)
      ? { channelId: BigInt(selectedChannelId) }
      : { channelId: { in: userChannelIds } };

  const videoRows =
    userChannelIds.length > 0
      ? await prisma.video.findMany({
          where: whereClause,
          select: {
            id: true,
            videoId: true,
            title: true,
            description: true,
            publishedAt: true,
            readAt: true,
            channelId: true,
            channel: { select: { name: true, channelId: true } },
          },
        })
      : [];

  const unread = videoRows
    .filter((v) => v.readAt === null)
    .sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime());
  const read = videoRows
    .filter((v) => v.readAt !== null)
    .sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime());

  const sidebarVideos: VideoData[] = [...unread, ...read].map((v) => ({
    id: v.id.toString(),
    videoId: v.videoId,
    title: v.title,
    description: v.description,
    publishedAt: v.publishedAt.toISOString(),
    readAt: v.readAt ? v.readAt.toISOString() : null,
    channelId: v.channelId.toString(),
    channelName: v.channel.name,
    channelYtId: v.channel.channelId,
  }));

  return (
    <InboxShell
      initialChannels={channels}
      initialVideos={sidebarVideos}
      selectedChannelId={selectedChannelId}
      selectedVideoId={videoDbId}
    >
      <VideoReader video={videoData} />
    </InboxShell>
  );
}
