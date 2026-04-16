import { VideoPlatformType, prisma } from '@readtube/database';

import { isEmptyString } from '@/lib/string';
import { buildRssUrl } from '@/lib/youtube/urls';
import { extractVideoId, fetchVideoSnapshot } from '@/lib/youtube/videoSnapshot';

export interface AddVideoResult {
  videoId: string;
  /** YouTube video ID (11-char source_id). Used by the client to
   *  navigate to `/videos/<sourceId>` after adding. */
  sourceId: string;
  channelId: string;
  standaloneVideoId: string;
  createdVideo: boolean;
  createdChannel: boolean;
  createdStandalone: boolean;
}

export class AddVideoError extends Error {
  constructor(
    message: string,
    public readonly code: 'INVALID_URL' | 'FETCH_FAILED'
  ) {
    super(message);
    this.name = 'AddVideoError';
  }
}

/**
 * Adds an individual YouTube video to a user's personal library. Creates
 * a "shadow" Channel row for the video's owning channel if the user
 * isn't subscribed to it — the refresh-channels cron skips shadow
 * channels (see `fetchStaleChannels` in refresh-channels/steps.ts).
 *
 * Idempotent: re-running with the same (userId, videoUrl) yields the
 * same StandaloneVideo row without duplicating anything.
 */
export async function addVideoForUser(args: {
  userId: string;
  input: string;
}): Promise<AddVideoResult> {
  const videoId = extractVideoId(args.input);
  if (videoId == null) {
    throw new AddVideoError(
      'Invalid YouTube URL. Paste a URL like youtube.com/watch?v=..., youtu.be/..., or a bare video id.',
      'INVALID_URL'
    );
  }

  let snapshot;
  try {
    snapshot = await fetchVideoSnapshot(videoId);
  } catch (err) {
    throw new AddVideoError(
      err instanceof Error ? err.message : 'Failed to fetch video metadata',
      'FETCH_FAILED'
    );
  }

  // Upsert the owning Channel. If the user already subscribes to this
  // channel (e.g. the video is in their inbox already) the Channel row
  // exists and we reuse it. Otherwise we create a shadow Channel with
  // only the minimum fields — the refresh cron ignores it until a
  // UserSubscription is attached.
  const existingChannel = await prisma.channel.findUnique({
    where: {
      channel_unique_source: {
        source_type: VideoPlatformType.YOUTUBE,
        source_id: snapshot.channel.sourceId,
      },
    },
    select: { id: true },
  });

  const channel = await prisma.channel.upsert({
    where: {
      channel_unique_source: {
        source_type: VideoPlatformType.YOUTUBE,
        source_id: snapshot.channel.sourceId,
      },
    },
    create: {
      source_type: VideoPlatformType.YOUTUBE,
      source_id: snapshot.channel.sourceId,
      name: snapshot.channel.name,
      rss_url: buildRssUrl(snapshot.channel.sourceId),
      ...(!isEmptyString(snapshot.channel.handle) ? { handle: snapshot.channel.handle } : {}),
      ...(snapshot.channel.logoUrl != null ? { logo_url: snapshot.channel.logoUrl } : {}),
    },
    // Refresh handle/logo opportunistically when we have better data,
    // but don't clobber with nulls.
    update: {
      ...(!isEmptyString(snapshot.channel.handle) ? { handle: snapshot.channel.handle } : {}),
      ...(snapshot.channel.logoUrl != null ? { logo_url: snapshot.channel.logoUrl } : {}),
    },
    select: { id: true },
  });
  const createdChannel = existingChannel == null;

  const existingVideo = await prisma.video.findUnique({
    where: {
      video_unique_channel_source: { channel_id: channel.id, source_id: snapshot.videoId },
    },
    select: { id: true },
  });

  const video = await prisma.video.upsert({
    where: {
      video_unique_channel_source: { channel_id: channel.id, source_id: snapshot.videoId },
    },
    create: {
      channel_id: channel.id,
      source_id: snapshot.videoId,
      title: snapshot.title,
      description: snapshot.description,
      published_at: snapshot.publishedAt,
      thumbnail_url: snapshot.thumbnailUrl,
      duration_seconds: snapshot.durationSeconds,
    },
    update: {
      title: snapshot.title,
      ...(isEmptyString(snapshot.description) ? {} : { description: snapshot.description }),
      thumbnail_url: snapshot.thumbnailUrl,
      ...(snapshot.durationSeconds != null ? { duration_seconds: snapshot.durationSeconds } : {}),
    },
    select: { id: true },
  });
  const createdVideo = existingVideo == null;

  const existingStandalone = await prisma.standaloneVideo.findUnique({
    where: { standalone_video_unique_user_video: { user_id: args.userId, video_id: video.id } },
    select: { id: true },
  });

  const standalone = await prisma.standaloneVideo.upsert({
    where: { standalone_video_unique_user_video: { user_id: args.userId, video_id: video.id } },
    create: { user_id: args.userId, video_id: video.id },
    update: {},
    select: { id: true },
  });
  const createdStandalone = existingStandalone == null;

  return {
    videoId: video.id,
    sourceId: snapshot.videoId,
    channelId: channel.id,
    standaloneVideoId: standalone.id,
    createdVideo,
    createdChannel,
    createdStandalone,
  };
}
