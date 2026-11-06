import type { PrismaClient } from '@readtube/database';

import { FOLLOWABLE_CHANNEL, pickHeadline } from './suggestions';
import type { ChannelPreview } from './types';

/** Videos listed in a channel preview. */
export const CHANNEL_PREVIEW_VIDEOS = 5;

/**
 * A channel's basic details and newest videos, for the onboarding
 * preview. Null unless the channel is one the page could offer
 * ({@link FOLLOWABLE_CHANNEL}), so the endpoint can't be used to browse
 * arbitrary rows. Every recent video is listed, readable or not, so the
 * preview shows how often the channel posts; only readable ones open.
 */
export async function loadChannelPreview(
  prisma: PrismaClient,
  channelId: string
): Promise<ChannelPreview | null> {
  const channel = await prisma.channel.findFirst({
    where: { id: channelId, ...FOLLOWABLE_CHANNEL },
    select: {
      id: true,
      source_id: true,
      source_type: true,
      name: true,
      handle: true,
      logo_url: true,
      description: true,
      _count: { select: { subscriptions: true } },
      videos: {
        orderBy: [{ published_at: { sort: 'desc', nulls: 'last' } }, { id: 'desc' }],
        take: CHANNEL_PREVIEW_VIDEOS,
        select: {
          id: true,
          title: true,
          thumbnail_url: true,
          duration_seconds: true,
          published_at: true,
          transcripts: {
            orderBy: { created_at: 'desc' },
            take: 1,
            select: {
              summaries: {
                where: { status: 'READY' },
                select: { headline: true, language: true },
              },
              articles: { where: { status: 'READY' }, take: 1, select: { id: true } },
            },
          },
        },
      },
    },
  });
  if (channel == null) {
    return null;
  }

  return {
    id: channel.id,
    sourceId: channel.source_id,
    platform: channel.source_type,
    name: channel.name,
    handle: channel.handle,
    logoUrl: channel.logo_url,
    description: channel.description,
    followerCount: channel._count.subscriptions,
    videos: channel.videos.map((video) => {
      const transcript = video.transcripts[0];
      const summaries = transcript?.summaries ?? [];
      return {
        id: video.id,
        title: video.title,
        thumbnailUrl: video.thumbnail_url,
        durationSeconds: video.duration_seconds,
        publishedAt: video.published_at?.toISOString() ?? null,
        headline: pickHeadline(summaries),
        readable: summaries.length > 0 || (transcript?.articles.length ?? 0) > 0,
      };
    }),
  };
}
