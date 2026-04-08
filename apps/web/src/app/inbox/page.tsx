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

  // Fetch videos scoped to user's channels
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
          orderBy: [{ readAt: 'asc' }, { publishedAt: 'desc' }],
        })
      : [];

  const unread = videoRows
    .filter((v) => v.readAt === null)
    .sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime());
  const read = videoRows
    .filter((v) => v.readAt !== null)
    .sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime());

  const videos: VideoData[] = [...unread, ...read].map((v) => ({
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
      initialVideos={videos}
      selectedChannelId={selectedChannelId}
      selectedVideoId={null}
    />
  );
}
