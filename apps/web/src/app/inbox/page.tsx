import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';

import InboxShell from '@/components/inbox/InboxShell';
import { prisma } from '@/lib/db';
import { ensureUserExists } from '@/lib/db/user';
import { getSubscribedChannelsWithUnread } from '@/lib/subscriptions';
import type { ChannelData, VideoData } from '@/lib/types';

interface Props {
  searchParams: Promise<{ channel?: string }>;
}

export default async function InboxPage({ searchParams }: Props) {
  const { userId } = await auth();
  if (userId == null) {
    redirect('/');
  }

  await ensureUserExists(userId);

  const { channel: channelParam } = await searchParams;
  const selectedChannelId = channelParam ?? null;

  // Single SQL query: subscriptions + channel metadata + per-channel unread
  // counts (with watermark + consumption filter), all in one round-trip.
  const subscriptionRows = await getSubscribedChannelsWithUnread(prisma, userId);

  // Per-channel watermark map for the video list mapper below.
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

  type VideoRow = (typeof videoRows)[number];
  // A video is "read" if either:
  //   1. there's an explicit UserVideoConsumption row, OR
  //   2. the user's subscription watermark covers it (published_at <= watermark).
  const readAtFor = (v: VideoRow): Date | null => {
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

  const videos: VideoData[] = sortedRows.map((v) => {
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
      initialVideos={videos}
      selectedChannelId={selectedChannelId}
      selectedVideoId={null}
    />
  );
}
