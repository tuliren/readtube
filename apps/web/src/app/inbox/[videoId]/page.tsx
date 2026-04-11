import { auth } from '@clerk/nextjs/server';
import { prisma } from '@readtube/database';
import { notFound, redirect } from 'next/navigation';

import InboxShell from '@/components/inbox/InboxShell';
import VideoReader from '@/components/reader/VideoReader';
import { ensureUserExists } from '@/lib/db/user';
import { loadInboxVideos, searchParamsToInboxQuery } from '@/lib/inbox/loadVideos';
import { decorateVideo, loadTriageContext } from '@/lib/inbox/triage';
import { getSubscribedChannelsWithUnread } from '@/lib/subscriptions';
import type { ChannelData, VideoData } from '@/lib/types';

interface Props {
  params: Promise<{ videoId: string }>;
  // Wide Next.js shape — we feed the whole bag through
  // searchParamsToInboxQuery so the sidebar list reflects every
  // active filter, not just channelId. See /inbox/page.tsx for the
  // longer explanation.
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function VideoPage({ params, searchParams }: Props) {
  const { userId } = await auth();
  if (userId == null) {
    redirect('/');
  }

  await ensureUserExists(userId);

  const { videoId: videoDbId } = await params;
  const query = searchParamsToInboxQuery(await searchParams);
  const selectedChannelId = query.channelId ?? null;

  // Fetch the video with IDOR check
  const video = await prisma.video.findFirst({
    where: { id: videoDbId, channel: { subscriptions: { some: { user_id: userId } } } },
    select: {
      id: true,
      source_id: true,
      title: true,
      description: true,
      published_at: true,
      duration_seconds: true,
      transcript_unavailable: true,
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
  const readerTriage = await loadTriageContext(prisma, userId, [video.id]);
  const videoData: VideoData = decorateVideo(video, readerTriage, existingReadAt ?? new Date());

  // Single SQL query: subscriptions + channel metadata + per-channel unread
  // counts (with watermark + consumption filter), all in one round-trip.
  const subscriptionRows = await getSubscribedChannelsWithUnread(prisma, userId);

  const channels: ChannelData[] = subscriptionRows.map((row) => ({
    id: row.channel_id,
    sourceId: row.source_id,
    name: row.name,
    rssUrl: row.rss_url,
    createdAt: row.created_at.toISOString(),
    unreadCount: row.unread_count,
    folderId: row.folder_id,
    priority: row.priority,
    muteUntil: row.mute_until != null ? row.mute_until.toISOString() : null,
  }));

  // Same helper /api/videos uses, so the SSR-rendered sidebar list is
  // byte-for-byte identical to what SWR would have fetched for this
  // URL. Replaces the bespoke channel-only where + JS archive/snooze
  // post-filter that ignored every other InboxQuery key.
  const sidebarVideos = await loadInboxVideos(prisma, userId, query);

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
