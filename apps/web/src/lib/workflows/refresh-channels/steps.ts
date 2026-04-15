import { prisma } from '@readtube/database';

import { isEmptyString } from '@/lib/string';
import { fetchChannelSnapshot } from '@/lib/youtube/channelSnapshot';

/** Number of days before a channel is considered stale and eligible for refresh. */
export const STALE_DAYS = 5;

/** Maximum number of channels to refresh per workflow run. */
export const BATCH_SIZE = 10;

/**
 * Small delay between per-channel fetches so we stay polite toward
 * YouTube's public RSS endpoint and don't burst a large batch of
 * requests in parallel.
 */
const RATE_LIMIT_DELAY_MS = 250;

export interface StaleChannel {
  id: string;
  source_id: string;
  name: string;
  rss_url: string;
}

export async function fetchStaleChannels(): Promise<StaleChannel[]> {
  'use step';

  const cutoff = new Date(Date.now() - STALE_DAYS * 24 * 60 * 60 * 1000);

  return prisma.channel.findMany({
    where: {
      OR: [{ checked_at: null }, { checked_at: { lt: cutoff } }],
    },
    orderBy: { checked_at: { sort: 'asc', nulls: 'first' } },
    take: BATCH_SIZE,
    select: { id: true, source_id: true, name: true, rss_url: true },
  });
}

export async function fetchChannelById(channelId: string): Promise<StaleChannel | null> {
  'use step';

  return prisma.channel.findUnique({
    where: { id: channelId },
    select: { id: true, source_id: true, name: true, rss_url: true },
  });
}

export interface RefreshResult {
  channelId: string;
  videosProcessed: number;
  nameUpdated: boolean;
}

export async function refreshChannel(channel: StaleChannel): Promise<RefreshResult> {
  'use step';

  await new Promise((r) => setTimeout(r, RATE_LIMIT_DELAY_MS));

  const snapshot = await fetchChannelSnapshot({
    channelPageUrl: `https://www.youtube.com/channel/${channel.source_id}`,
    rssUrl: channel.rss_url,
  });

  const nameUpdated = snapshot.name !== channel.name;

  for (const video of snapshot.videos) {
    await prisma.video.upsert({
      where: {
        video_unique_channel_source: {
          channel_id: channel.id,
          source_id: video.videoId,
        },
      },
      create: {
        channel_id: channel.id,
        source_id: video.videoId,
        title: video.title,
        description: video.description,
        published_at: video.publishedAt,
        thumbnail_url: video.thumbnailUrl,
        duration_seconds: video.durationSeconds,
      },
      update: {
        title: video.title,
        ...(isEmptyString(video.description) ? {} : { description: video.description }),
        thumbnail_url: video.thumbnailUrl,
        ...(video.durationSeconds != null ? { duration_seconds: video.durationSeconds } : {}),
      },
    });
  }

  await prisma.channel.update({
    where: { id: channel.id },
    data: {
      ...(nameUpdated ? { name: snapshot.name } : {}),
      ...(!isEmptyString(snapshot.logoUrl) ? { logo_url: snapshot.logoUrl } : {}),
      ...(!isEmptyString(snapshot.handle) ? { handle: snapshot.handle } : {}),
      checked_at: new Date(),
    },
  });

  return {
    channelId: channel.id,
    videosProcessed: snapshot.videos.length,
    nameUpdated,
  };
}
