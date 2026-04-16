import { VideoPlatformType, prisma } from '@readtube/database';

import { isEmptyString } from '@/lib/string';
import { fetchRssFeed, isYouTubeShort } from '@/lib/youtube/channelRss';
import { buildPlaylistRssUrl, buildRssUrl, extractPlaylistId } from '@/lib/youtube/urls';

export interface AddPlaylistResult {
  playlistId: string;
  playlistName: string;
  videosProcessed: number;
}

export class AddPlaylistError extends Error {
  constructor(
    message: string,
    public readonly code: 'INVALID_URL' | 'FETCH_FAILED'
  ) {
    super(message);
    this.name = 'AddPlaylistError';
  }
}

/**
 * Adds a YouTube playlist to the user's library. Fetches the playlist
 * RSS feed, creates a Playlist row, and for each video upserts a
 * shadow Channel + Video + StandaloneVideo + PlaylistVideo row.
 *
 * The playlist name comes from the RSS feed title. If a playlist with
 * that name already exists for the user, a numeric suffix is appended.
 *
 * Idempotent at the video level: re-adding the same playlist upserts
 * existing videos without duplication. The Playlist row itself is
 * always created fresh (different cuid).
 */
export async function addPlaylistForUser(args: {
  userId: string;
  input: string;
}): Promise<AddPlaylistResult> {
  const playlistId = extractPlaylistId(args.input);
  if (playlistId == null) {
    throw new AddPlaylistError(
      'Invalid YouTube playlist URL. Paste a URL like youtube.com/playlist?list=PL…, youtube.com/watch?v=…&list=PL…, or a bare playlist ID.',
      'INVALID_URL'
    );
  }

  let feed;
  try {
    feed = await fetchRssFeed(buildPlaylistRssUrl(playlistId));
  } catch (err) {
    throw new AddPlaylistError(
      err instanceof Error ? err.message : 'Failed to fetch playlist',
      'FETCH_FAILED'
    );
  }

  // The RSS feed title for a playlist is the playlist's display name.
  // For channel uploads playlists (UU-prefixed) it may just be the
  // channel name + "- Videos", which is fine.
  const baseName = feed.name || `Playlist ${playlistId}`;

  // Dedupe playlist names by appending (2), (3), etc.
  const name = await deduplicatePlaylistName(args.userId, baseName);

  // Max sort_order so the new playlist appears at the end.
  const max = await prisma.playlist.aggregate({
    where: { user_id: args.userId },
    _max: { sort_order: true },
  });
  const nextOrder = (max._max.sort_order ?? -1) + 1;

  const playlist = await prisma.playlist.create({
    data: { user_id: args.userId, name, sort_order: nextOrder },
    select: { id: true },
  });

  const videos = feed.videos.filter((v) => !isYouTubeShort(v));
  let videosProcessed = 0;

  for (let i = 0; i < videos.length; i++) {
    const v = videos[i];

    // The playlist RSS channelId is the *playlist owner's* channel, not
    // each individual video's channel. For simplicity, use the feed
    // channelId for all videos — if the user later subscribes to the
    // actual channel, the refresh cron will rewrite the Video row via
    // its own upsert (keyed on video_unique_source, which is
    // source_type + source_id and is unique globally).
    const channel = await prisma.channel.upsert({
      where: {
        channel_unique_source: {
          source_type: VideoPlatformType.YOUTUBE,
          source_id: feed.channelId,
        },
      },
      create: {
        source_type: VideoPlatformType.YOUTUBE,
        source_id: feed.channelId,
        name: feed.name,
        rss_url: buildRssUrl(feed.channelId),
      },
      update: {},
      select: { id: true },
    });

    // Use video_unique_source (source_type + source_id) which is globally
    // unique, so if the video was already ingested via a channel
    // subscription the existing row is reused.
    const video = await prisma.video.upsert({
      where: {
        video_unique_source: {
          source_type: VideoPlatformType.YOUTUBE,
          source_id: v.videoId,
        },
      },
      create: {
        channel_id: channel.id,
        source_id: v.videoId,
        title: v.title,
        description: v.description,
        published_at: v.publishedAt,
        thumbnail_url: v.thumbnailUrl,
      },
      update: {
        title: v.title,
        ...(isEmptyString(v.description) ? {} : { description: v.description }),
        ...(v.thumbnailUrl != null ? { thumbnail_url: v.thumbnailUrl } : {}),
      },
      select: { id: true },
    });

    // Implicitly mark the video as part of the user's library.
    await prisma.standaloneVideo.upsert({
      where: { standalone_video_unique_user_video: { user_id: args.userId, video_id: video.id } },
      create: { user_id: args.userId, video_id: video.id },
      update: {},
    });

    await prisma.playlistVideo.upsert({
      where: {
        playlist_video_unique_playlist_video: { playlist_id: playlist.id, video_id: video.id },
      },
      create: { playlist_id: playlist.id, video_id: video.id, sort_order: i },
      update: {},
    });

    videosProcessed++;
  }

  return { playlistId: playlist.id, playlistName: name, videosProcessed };
}

/**
 * If a playlist named `baseName` already exists for the user, appends
 * (2), (3), etc. Returns the first name that's available.
 */
async function deduplicatePlaylistName(userId: string, baseName: string): Promise<string> {
  const existing = await prisma.playlist.findFirst({
    where: { user_id: userId, name: baseName },
    select: { id: true },
  });
  if (existing == null) {
    return baseName;
  }
  for (let i = 2; i <= 100; i++) {
    const candidate = `${baseName} (${i})`;
    const dup = await prisma.playlist.findFirst({
      where: { user_id: userId, name: candidate },
      select: { id: true },
    });
    if (dup == null) {
      return candidate;
    }
  }
  // Fallback — extremely unlikely.
  return `${baseName} (${Date.now()})`;
}
