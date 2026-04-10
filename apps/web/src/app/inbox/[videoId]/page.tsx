import { auth } from '@clerk/nextjs/server';
import { notFound, redirect } from 'next/navigation';

import InboxShell from '@/components/inbox/InboxShell';
import VideoReader from '@/components/reader/VideoReader';
import { prisma } from '@/lib/db';
import { ensureUserExists } from '@/lib/db/user';
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

  await ensureUserExists(userId);

  const { videoId: videoDbId } = await params;
  const { channel: channelParam } = await searchParams;
  const selectedChannelId = channelParam ?? null;

  // Fetch the video with IDOR check
  const video = await prisma.video.findFirst({
    where: { id: videoDbId, channel: { subscriptions: { some: { user_id: userId } } } },
    select: {
      id: true,
      source_id: true,
      title: true,
      description: true,
      published_at: true,
      read_at: true,
      channel_id: true,
      channel: { select: { name: true, source_id: true } },
    },
  });

  if (!video) {
    notFound();
  }

  // Mark as read immediately (idempotent)
  if (video.read_at === null) {
    await prisma.video.update({
      where: { id: video.id },
      data: { read_at: new Date() },
    });
  }

  const videoData: VideoData = {
    id: video.id,
    sourceId: video.source_id,
    title: video.title,
    description: video.description,
    publishedAt: video.published_at.toISOString(),
    readAt: video.read_at ? video.read_at.toISOString() : new Date().toISOString(),
    channelId: video.channel_id,
    channelName: video.channel.name,
    channelSourceId: video.channel.source_id,
  };

  const channelSubs = await prisma.userSubscription.findMany({
    where: { user_id: userId },
    select: {
      channel: {
        select: {
          id: true,
          source_id: true,
          name: true,
          rss_url: true,
          created_at: true,
          _count: { select: { videos: { where: { read_at: null } } } },
        },
      },
    },
  });
  const channelRows = channelSubs
    .map((s) => s.channel)
    .sort((a, b) => a.name.localeCompare(b.name));

  const channels: ChannelData[] = channelRows.map((c) => ({
    id: c.id,
    sourceId: c.source_id,
    name: c.name,
    rssUrl: c.rss_url,
    createdAt: c.created_at.toISOString(),
    unreadCount: c._count.videos,
  }));

  const userChannelIds = channelRows.map((c) => c.id);
  const whereClause =
    selectedChannelId && userChannelIds.includes(selectedChannelId)
      ? { channel_id: selectedChannelId }
      : { channel_id: { in: userChannelIds } };

  const videoRows =
    userChannelIds.length > 0
      ? await prisma.video.findMany({
          where: whereClause,
          select: {
            id: true,
            source_id: true,
            title: true,
            description: true,
            published_at: true,
            read_at: true,
            channel_id: true,
            channel: { select: { name: true, source_id: true } },
          },
        })
      : [];

  const unread = videoRows
    .filter((v) => v.read_at === null)
    .sort((a, b) => b.published_at.getTime() - a.published_at.getTime());
  const read = videoRows
    .filter((v) => v.read_at !== null)
    .sort((a, b) => b.published_at.getTime() - a.published_at.getTime());

  const sidebarVideos: VideoData[] = [...unread, ...read].map((v) => ({
    id: v.id,
    sourceId: v.source_id,
    title: v.title,
    description: v.description,
    publishedAt: v.published_at.toISOString(),
    readAt: v.read_at ? v.read_at.toISOString() : null,
    channelId: v.channel_id,
    channelName: v.channel.name,
    channelSourceId: v.channel.source_id,
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
