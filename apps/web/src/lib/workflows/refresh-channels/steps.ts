import { prisma } from '@readtube/database';

import { isEmptyString } from '@/lib/string';
import { fetchChannelLatest } from '@/lib/youtube/channelMetadata';
import { scrapeChannel } from '@/lib/youtube/scrapeChannel';

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

  const videoSourceIds = data.videos.map((v) => v.videoId);
  const existingVideos = await prisma.video.findMany({
    where: { channel_id: channel.id, source_id: { in: videoSourceIds } },
    select: { source_id: true, duration_seconds: true },
  });
  const videosMissingDuration = new Set(
    existingVideos.filter((v) => v.duration_seconds == null).map((v) => v.source_id)
  );
  // Videos not yet in the DB also need duration
  const existingSourceIds = new Set(existingVideos.map((v) => v.source_id));
  for (const v of data.videos) {
    if (!existingSourceIds.has(v.videoId)) {
      videosMissingDuration.add(v.videoId);
    }
  }

  const needsDuration = videosMissingDuration.size > 0;

  // Best-effort scrape for logo_url and duration_seconds — fields the
  // TranscriptAPI RSS endpoint doesn't provide. Always scrape to keep
  // logo_url fresh; only collect durations for videos that lack them.
  let logoUrl: string | null = null;
  const durationMap = new Map<string, number>();
  try {
    const channelPageUrl = `https://www.youtube.com/channel/${channel.source_id}`;
    const scraped = await scrapeChannel(channelPageUrl);
    logoUrl = scraped.logoUrl;
    if (needsDuration) {
      for (const v of scraped.videos) {
        if (v.durationSeconds != null && videosMissingDuration.has(v.videoId)) {
          durationMap.set(v.videoId, v.durationSeconds);
        }
      }
    }
  } catch (err) {
    console.warn(
      `[refresh-channels] scrape failed for ${channel.id}, skipping logo/duration:`,
      err
    );
  }

  const nameUpdated = data.channel.title !== channel.name;

  for (const video of data.videos) {
    const durationSeconds = durationMap.get(video.videoId) ?? null;

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
        duration_seconds: durationSeconds,
      },
      update: {
        title: video.title,
        ...(isEmptyString(video.description) ? {} : { description: video.description }),
        ...(video.thumbnailUrl != null ? { thumbnail_url: video.thumbnailUrl } : {}),
        ...(durationSeconds != null ? { duration_seconds: durationSeconds } : {}),
      },
    });
  }

  await prisma.channel.update({
    where: { id: channel.id },
    data: {
      ...(nameUpdated ? { name: data.channel.title } : {}),
      ...(!isEmptyString(logoUrl) ? { logo_url: logoUrl } : {}),
      checked_at: new Date(),
    },
  });

  return {
    channelId: channel.id,
    videosProcessed: data.videos.length,
    nameUpdated,
  };
}
