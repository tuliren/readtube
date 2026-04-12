import { prisma } from '@readtube/database';

import { isEmptyString } from '@/lib/string';
import { fetchChannelLatest } from '@/lib/youtube/channelMetadata';

/** Number of days before a channel is considered stale and eligible for refresh. */
export const STALE_DAYS = 5;

/** Maximum number of channels to refresh per workflow run. */
export const BATCH_SIZE = 10;

/** Delay in ms between API calls to stay well under the 300 req/min rate limit. */
const RATE_LIMIT_DELAY_MS = 250;

export interface StaleChannel {
  id: string;
  source_id: string;
  name: string;
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
    select: { id: true, source_id: true, name: true },
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

  const data = await fetchChannelLatest(channel.source_id);

  const nameUpdated = data.channel.title !== channel.name;

  for (const video of data.videos) {
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
      },
      update: {
        title: video.title,
        ...(isEmptyString(video.description) ? {} : { description: video.description }),
        ...(video.thumbnailUrl != null ? { thumbnail_url: video.thumbnailUrl } : {}),
      },
    });
  }

  await prisma.channel.update({
    where: { id: channel.id },
    data: {
      ...(nameUpdated ? { name: data.channel.title } : {}),
      checked_at: new Date(),
    },
  });

  return {
    channelId: channel.id,
    videosProcessed: data.videos.length,
    nameUpdated,
  };
}
