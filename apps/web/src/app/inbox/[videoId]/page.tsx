import { auth } from '@clerk/nextjs/server';
import { notFound, redirect } from 'next/navigation';

import InboxShell from '@/components/inbox/InboxShell';
import VideoReader from '@/components/reader/VideoReader';
import { prisma } from '@/lib/db';
import { ensureUserExists } from '@/lib/db/user';
import { getSubscribedChannelsWithUnread } from '@/lib/subscriptions';
import type { ChannelData, VideoData } from '@/lib/types';

interface Props {
  params: Promise<{ videoId: string }>;
  searchParams: Promise<{ channel?: string }>;
}

export default async function VideoPage({ params, searchParams }: Props) {
  const { userId } = await auth();
  if (userId == null) {
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
      channel_id: true,
      channel: { select: { name: true, source_id: true } },
      consumptions: {
        where: { user_id: userId },
        select: { read_at: true },
        take: 1,
      },
    },
  });

  if (video == null) {
    notFound();
  }

  // Mark as consumed immediately — upsert is idempotent.
  await prisma.userVideoConsumption.upsert({
    where: {
      user_video_consumption_unique_user_video: { user_id: userId, video_id: video.id },
    },
    create: { user_id: userId, video_id: video.id },
    update: {},
  });

  const existingReadAt = video.consumptions[0]?.read_at;
  const videoData: VideoData = {
    id: video.id,
    sourceId: video.source_id,
    title: video.title,
    description: video.description,
    publishedAt: video.published_at.toISOString(),
    readAt: existingReadAt ? existingReadAt.toISOString() : new Date().toISOString(),
    channelId: video.channel_id,
    channelName: video.channel.name,
    channelSourceId: video.channel.source_id,
  };

  // Single SQL query: subscriptions + channel metadata + per-channel unread
  // counts (with watermark + consumption filter), all in one round-trip.
  const subscriptionRows = await getSubscribedChannelsWithUnread(prisma, userId);

  const watermarkByChannelId = new Map<string, Date | null>(
    subscriptionRows.map((row) => [row.channel_id, row.read_at])
  );

  const channels: ChannelData[] = subscriptionRows.map((row) => ({
    id: row.channel_id,
    sourceId: row.source_id,
    name: row.name,
    rssUrl: row.rss_url,
    createdAt: row.created_at.toISOString(),
    unreadCount: row.unread_count,
  }));

  const userChannelIds = subscriptionRows.map((row) => row.channel_id);
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
            channel_id: true,
            channel: { select: { name: true, source_id: true } },
            consumptions: {
              where: { user_id: userId },
              select: { read_at: true },
              take: 1,
            },
          },
        })
      : [];

  type SidebarRow = (typeof videoRows)[number];
  const readAtFor = (v: SidebarRow): Date | null => {
    const explicit = v.consumptions[0]?.read_at;
    if (explicit != null) {
      return explicit;
    }
    const watermark = watermarkByChannelId.get(v.channel_id);
    if (watermark != null && v.published_at.getTime() <= watermark.getTime()) {
      return watermark;
    }
    return null;
  };

  const sortedRows = [...videoRows].sort(
    (a, b) => b.published_at.getTime() - a.published_at.getTime()
  );

  const sidebarVideos: VideoData[] = sortedRows.map((v) => {
    const readAt = readAtFor(v);
    return {
      id: v.id,
      sourceId: v.source_id,
      title: v.title,
      description: v.description,
      publishedAt: v.published_at.toISOString(),
      readAt: readAt ? readAt.toISOString() : null,
      channelId: v.channel_id,
      channelName: v.channel.name,
      channelSourceId: v.channel.source_id,
    };
  });

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
