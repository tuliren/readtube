import { VideoPlatformType, prisma } from '@readtube/database';

import { hasChannelHandleConflict } from '@/lib/channels/handleConflict';
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

  // Upsert the owning Channel. Uses findUnique + explicit create/update
  // (not prisma.upsert) so the handle field can be guarded against the
  // `@@unique([source_type, handle])` constraint when another channel
  // already owns the scraped handle. See upsertChannelWithVideos for
  // the same pattern; we don't reuse that helper here because it also
  // creates the initial video list from the snapshot — add-video only
  // wants the Channel row.
  const existingChannel = await prisma.channel.findUnique({
    where: {
      channel_unique_source: {
        source_type: VideoPlatformType.YOUTUBE,
        source_id: snapshot.channel.sourceId,
      },
    },
    select: { id: true },
  });
  const hasHandle = !isEmptyString(snapshot.channel.handle);

  let channelId: string;
  if (existingChannel != null) {
    const conflictOnHandle = await hasChannelHandleConflict(
      prisma,
      snapshot.channel.handle,
      existingChannel.id
    );
    await prisma.channel.update({
      where: { id: existingChannel.id },
      data: {
        ...(snapshot.channel.logoUrl != null ? { logo_url: snapshot.channel.logoUrl } : {}),
        ...(hasHandle && !conflictOnHandle ? { handle: snapshot.channel.handle } : {}),
      },
    });
    channelId = existingChannel.id;
  } else {
    const handleAlreadyUsed = await hasChannelHandleConflict(prisma, snapshot.channel.handle, null);
    const created = await prisma.channel.create({
      data: {
        source_type: VideoPlatformType.YOUTUBE,
        source_id: snapshot.channel.sourceId,
        name: snapshot.channel.name,
        rss_url: buildRssUrl(snapshot.channel.sourceId),
        ...(hasHandle && !handleAlreadyUsed ? { handle: snapshot.channel.handle } : {}),
        ...(snapshot.channel.logoUrl != null ? { logo_url: snapshot.channel.logoUrl } : {}),
      },
      select: { id: true },
    });
    channelId = created.id;
  }
  const channel = { id: channelId };
  const createdChannel = existingChannel == null;

  // Use video_unique_source (globally unique) so we match a video
  // that was previously created under a different channel (e.g. from
  // a playlist add). Also corrects channel_id to the video's actual
  // channel since we have accurate metadata from the watch page.
  const existingVideo = await prisma.video.findUnique({
    where: {
      video_unique_source: { source_type: VideoPlatformType.YOUTUBE, source_id: snapshot.videoId },
    },
    select: { id: true },
  });

  const video = await prisma.video.upsert({
    where: {
      video_unique_source: { source_type: VideoPlatformType.YOUTUBE, source_id: snapshot.videoId },
    },
    create: {
      channel_id: channel.id,
      // source_type must match the `where` clause so Prisma uses a
      // native Postgres upsert (CLAUDE.md).
      source_type: VideoPlatformType.YOUTUBE,
      source_id: snapshot.videoId,
      title: snapshot.title,
      description: snapshot.description,
      published_at: snapshot.publishedAt,
      thumbnail_url: snapshot.thumbnailUrl,
      duration_seconds: snapshot.durationSeconds,
    },
    update: {
      channel_id: channel.id,
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

  // Mark the newly added video as read so it doesn't appear as unread
  // in the library. Idempotent — upsert is a no-op if already read.
  await prisma.userVideoConsumption.upsert({
    where: {
      user_video_consumption_unique_user_video: { user_id: args.userId, video_id: video.id },
    },
    create: { user_id: args.userId, video_id: video.id },
    update: {},
  });

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
