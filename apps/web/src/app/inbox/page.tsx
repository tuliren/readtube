import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';

import InboxShell from '@/components/inbox/InboxShell';
import { prisma } from '@/lib/db';
import type { ChannelData, VideoData } from '@/lib/types';

interface Props {
  searchParams: Promise<{ channel?: string }>;
}

export default async function InboxPage({ searchParams }: Props) {
  const { userId } = await auth();
  if (!userId) {
    redirect('/');
  }

  const { channel: channelParam } = await searchParams;
  const selectedChannelId = channelParam ?? null;

  // Fetch channels with unread counts
  const channelRows = await prisma.channel.findMany({
    where: { user_id: userId },
    select: {
      id: true,
      channel_id: true,
      name: true,
      rss_url: true,
      created_at: true,
      _count: { select: { videos: { where: { read_at: null } } } },
    },
    orderBy: { name: 'asc' },
  });

  const channels: ChannelData[] = channelRows.map((c) => ({
    id: c.id,
    channelId: c.channel_id,
    name: c.name,
    rssUrl: c.rss_url,
    createdAt: c.created_at.toISOString(),
    unreadCount: c._count.videos,
  }));

  // Fetch videos scoped to user's channels
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
            video_id: true,
            title: true,
            description: true,
            published_at: true,
            read_at: true,
            channel_id: true,
            channel: { select: { name: true, channel_id: true } },
          },
          orderBy: [{ read_at: 'asc' }, { published_at: 'desc' }],
        })
      : [];

  const unread = videoRows
    .filter((v) => v.read_at === null)
    .sort((a, b) => b.published_at.getTime() - a.published_at.getTime());
  const read = videoRows
    .filter((v) => v.read_at !== null)
    .sort((a, b) => b.published_at.getTime() - a.published_at.getTime());

  const videos: VideoData[] = [...unread, ...read].map((v) => ({
    id: v.id,
    videoId: v.video_id,
    title: v.title,
    description: v.description,
    publishedAt: v.published_at.toISOString(),
    readAt: v.read_at ? v.read_at.toISOString() : null,
    channelId: v.channel_id,
    channelName: v.channel.name,
    channelYtId: v.channel.channel_id,
  }));

  return (
    <InboxShell
      initialChannels={channels}
      initialVideos={videos}
      selectedChannelId={selectedChannelId}
      selectedVideoId={null}
    />
  );
}
