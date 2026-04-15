import { auth } from '@clerk/nextjs/server';
import { prisma } from '@readtube/database';
import { notFound, redirect } from 'next/navigation';

import InboxShell from '@/components/inbox/InboxShell';
import VideoReader from '@/components/reader/VideoReader';
import { resolveChannelSlug } from '@/lib/channels/resolveChannelSlug';
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

/**
 * Authenticated video reader. Requires a signed-in user who is
 * subscribed to the video's channel — everyone else is redirected
 * to the public mirror at `/p/videos/[id]`. That way stray links
 * still work for anonymous recipients, while the canonical URL
 * stays clean (no `?preview=...` flags).
 */
export default async function VideoPage({ params, searchParams }: Props) {
  const { videoId } = await params;
  const { userId } = await auth();

  const stub = await resolveVideoSourceId(prisma, videoId);
  if (stub == null) {
    notFound();
  }

  if (userId == null) {
    redirect(`/p/videos/${encodeURIComponent(stub.source_id)}`);
  }

  await ensureUserExists(userId);
  const subscribed = await prisma.userSubscription.findFirst({
    where: { user_id: userId, channel_id: stub.channel_id },
    select: { id: true },
  });
  if (subscribed == null) {
    redirect(`/p/videos/${encodeURIComponent(stub.source_id)}`);
  }

  const rawSearchParams = await searchParams;
  const baseQuery = searchParamsToInboxQuery(rawSearchParams);
  // When the reader was opened from `/channels/[slug]`, the channel
  // scope lives in the returnTo path rather than the query string.
  // Resolve it so the sidebar's video list stays narrowed to that
  // channel while the user is reading. Falls through to the user's
  // full inbox for `/inbox` or deep links.
  const channelIdFromReturnTo = await resolveChannelIdFromReturnTo(
    rawSearchParams.returnTo,
    userId
  );
  const query =
    channelIdFromReturnTo != null ? { ...baseQuery, channelId: channelIdFromReturnTo } : baseQuery;

  const video = await prisma.video.findFirst({
    where: { id: stub.id, channel: { subscriptions: { some: { user_id: userId } } } },
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
    <div className="h-screen overflow-hidden">
      <InboxShell
        initialChannels={channels}
        initialVideos={initial.videos}
        initialTotal={initial.total}
        selectedChannelId={query.channelId ?? null}
        selectedVideoId={video.id}
      >
        <VideoReader video={videoData} />
      </InboxShell>
    </div>
  );
}

/**
 * Extract the channel scope from a `returnTo` URL pointing at
 * `/channels/[slug]`. Returns the DB channel id if the slug resolves
 * AND the caller is subscribed (so we don't silently scope the
 * sidebar to an unrelated channel because of a tampered query
 * param). Returns null otherwise.
 */
async function resolveChannelIdFromReturnTo(
  rawReturnTo: string | string[] | undefined,
  userId: string
): Promise<string | null> {
  const returnTo = typeof rawReturnTo === 'string' ? rawReturnTo : null;
  if (returnTo == null || !returnTo.startsWith('/channels/')) {
    return null;
  }
  const afterPrefix = returnTo.slice('/channels/'.length);
  const slug = afterPrefix.split(/[/?#]/)[0];
  if (slug.length === 0) {
    return null;
  }
  const channel = await resolveChannelSlug(prisma, slug);
  if (channel == null) {
    return null;
  }
  const subscribed = await prisma.userSubscription.findFirst({
    where: { user_id: userId, channel_id: channel.id },
    select: { id: true },
  });
  return subscribed != null ? channel.id : null;
}
