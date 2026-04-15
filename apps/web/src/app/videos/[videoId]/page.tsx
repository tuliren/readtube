import { auth } from '@clerk/nextjs/server';
import { prisma } from '@readtube/database';
import { notFound } from 'next/navigation';

import Footer from '@/components/Footer';
import Header from '@/components/Header';
import InboxShell from '@/components/inbox/InboxShell';
import VideoReader from '@/components/reader/VideoReader';
import { ensureUserExists } from '@/lib/db/user';
import { loadInboxVideos, searchParamsToInboxQuery } from '@/lib/inbox/loadVideos';
import { decorateVideo, loadTriageContext } from '@/lib/inbox/triage';
import { getSubscribedChannelsWithUnread } from '@/lib/subscriptions';
import type { ChannelData, VideoData } from '@/lib/types';
import { resolveVideoSourceId } from '@/lib/videos/resolveVideoSourceId';

interface Props {
  params: Promise<{ videoId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function VideoPage({ params, searchParams }: Props) {
  const { videoId } = await params;
  const { userId } = await auth();

  // Resolve by platform source_id + source_type. source_id alone
  // isn't globally unique across platforms — see the
  // `video_unique_source` index on [source_type, source_id].
  const stub = await resolveVideoSourceId(prisma, videoId);
  if (stub == null) {
    notFound();
  }

  if (userId != null) {
    await ensureUserExists(userId);
    const subscribed = await prisma.userSubscription.findFirst({
      where: { user_id: userId, channel_id: stub.channel_id },
      select: { id: true },
    });
    if (subscribed != null) {
      return renderAuthedReader(userId, stub.id, await searchParams);
    }
  }

  return renderPublicReader(stub.id);
}

async function renderAuthedReader(
  userId: string,
  videoDbId: string,
  rawSearchParams: Record<string, string | string[] | undefined>
) {
  const query = searchParamsToInboxQuery(rawSearchParams);

  const video = await prisma.video.findFirst({
    where: { id: videoDbId, channel: { subscriptions: { some: { user_id: userId } } } },
    select: {
      id: true,
      source_id: true,
      title: true,
      description: true,
      published_at: true,
      duration_seconds: true,
      thumbnail_url: true,
      transcript_unavailable: true,
      channel_id: true,
      channel: { select: { name: true, source_id: true, handle: true } },
      consumptions: {
        where: { user_id: userId },
        select: { read_at: true },
        take: 1,
      },
      transcripts: {
        orderBy: { created_at: 'desc' },
        take: 1,
        select: {
          summary: { select: { transcript_id: true } },
          articles: { take: 1, select: { id: true } },
        },
      },
    },
  });
  if (video == null) {
    notFound();
  }

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

  const subscriptionRows = await getSubscribedChannelsWithUnread(prisma, userId);
  const channels: ChannelData[] = subscriptionRows.map((row) => ({
    id: row.channel_id,
    sourceId: row.source_id,
    name: row.name,
    handle: row.handle,
    rssUrl: row.rss_url,
    logoUrl: row.logo_url ?? null,
    createdAt: row.created_at.toISOString(),
    unreadCount: row.unread_count,
    folderId: row.folder_id,
    priority: row.priority,
    muteUntil: row.mute_until != null ? row.mute_until.toISOString() : null,
  }));

  const initial = await loadInboxVideos(prisma, userId, query);

  return (
    <InboxShell
      initialChannels={channels}
      initialVideos={initial.videos}
      initialTotal={initial.total}
      selectedChannelId={query.channelId ?? null}
      selectedVideoId={video.id}
    >
      <VideoReader video={videoData} />
    </InboxShell>
  );
}

async function renderPublicReader(videoDbId: string) {
  const video = await prisma.video.findUnique({
    where: { id: videoDbId },
    select: {
      id: true,
      source_id: true,
      title: true,
      description: true,
      published_at: true,
      duration_seconds: true,
      thumbnail_url: true,
      transcript_unavailable: true,
      channel_id: true,
      channel: { select: { name: true, source_id: true, handle: true } },
      transcripts: {
        orderBy: { created_at: 'desc' },
        take: 1,
        select: {
          summary: { select: { transcript_id: true } },
          articles: { take: 1, select: { id: true } },
        },
      },
    },
  });
  if (video == null) {
    notFound();
  }

  const latest = video.transcripts[0];
  const hasSummary = latest?.summary != null;
  const hasArticle = (latest?.articles.length ?? 0) > 0;
  if (!hasSummary && !hasArticle) {
    notFound();
  }

  const videoData: VideoData = decorateVideo(
    video,
    {
      starredIds: new Set(),
      savedIds: new Set(),
      archivedIds: new Set(),
      tagsByVideoId: new Map(),
      noteCountsByVideoId: new Map(),
    },
    null
  );

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex flex-1 flex-col">
        <VideoReader video={videoData} publicMode />
      </main>
      <Footer />
    </div>
  );
}
