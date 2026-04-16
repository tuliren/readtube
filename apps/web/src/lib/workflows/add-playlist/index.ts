import { VideoPlatformType, prisma } from '@readtube/database';

import { isEmptyString } from '@/lib/string';
import type { RssChannel } from '@/lib/youtube/channelRss';
import { fetchRssFeed, isYouTubeShort } from '@/lib/youtube/channelRss';
import { scrapePlaylist } from '@/lib/youtube/playlistScrape';
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

/** Normalised shape for a video from either RSS or page scrape. */
interface PlaylistVideo {
  videoId: string;
  title: string;
  description: string;
  publishedAt: Date | null;
  thumbnailUrl: string | null;
  durationSeconds: number | null;
}

/** Normalised shape for playlist metadata from either source. */
interface PlaylistFeed {
  channelId: string;
  channelName: string;
  name: string;
  videos: PlaylistVideo[];
}

/**
 * Try RSS first (cheap, structured) then fall back to page scrape
 * (works for all playlist types). RSS returns 404 for user-created
 * playlists, mix playlists, and many PL-prefixed lists.
 */
async function fetchPlaylistData(playlistId: string): Promise<PlaylistFeed> {
  // Attempt 1: RSS feed
  try {
    const rss: RssChannel = await fetchRssFeed(buildPlaylistRssUrl(playlistId));
    return {
      channelId: rss.channelId,
      channelName: rss.name,
      name: rss.name,
      videos: rss.videos
        .filter((v) => !isYouTubeShort(v))
        .map((v) => ({
          videoId: v.videoId,
          title: v.title,
          description: v.description,
          publishedAt: v.publishedAt,
          thumbnailUrl: v.thumbnailUrl,
          durationSeconds: null,
        })),
    };
  } catch {
    // RSS failed (likely 404) — fall through to scrape.
  }

  // Attempt 2: page scrape
  const scraped = await scrapePlaylist(playlistId);
  return {
    channelId: scraped.channelId,
    channelName: scraped.channelName,
    name: scraped.title,
    videos: scraped.videos.map((v) => ({
      videoId: v.videoId,
      title: v.title,
      description: v.description,
      publishedAt: null,
      thumbnailUrl: v.thumbnailUrl,
      durationSeconds: v.durationSeconds,
    })),
  };
}

/**
 * Adds a YouTube playlist to the user's library. Tries the playlist
 * RSS feed first, then falls back to scraping the playlist page.
 * Creates a Playlist row and for each video upserts a shadow
 * Channel + Video + StandaloneVideo + PlaylistVideo row.
 *
 * The playlist name comes from the feed/page title. If a playlist
 * with that name already exists for the user, a numeric suffix is
 * appended.
 *
 * Idempotent at the video level: re-adding the same playlist upserts
 * existing videos without duplication. The Playlist row itself is
 * always created fresh (different cuid).
 */
export async function addPlaylistForUser(args: {
  userId: string;
  input: string;
}): Promise<AddPlaylistResult> {
  const ytPlaylistId = extractPlaylistId(args.input);
  if (ytPlaylistId == null) {
    throw new AddPlaylistError(
      'Invalid YouTube playlist URL. Paste a URL like youtube.com/playlist?list=PL…, youtube.com/watch?v=…&list=PL…, or a bare playlist ID.',
      'INVALID_URL'
    );
  }

  let feed: PlaylistFeed;
  try {
    feed = await fetchPlaylistData(ytPlaylistId);
  } catch (err) {
    console.error('[add-playlist] fetchPlaylistData failed:', err);
    throw new AddPlaylistError(
      err instanceof Error ? err.message : 'Failed to fetch playlist',
      'FETCH_FAILED'
    );
  }

  const baseName = feed.name || `Playlist ${ytPlaylistId}`;
  const name = await deduplicatePlaylistName(args.userId, baseName);

  const max = await prisma.playlist.aggregate({
    where: { user_id: args.userId },
    _max: { sort_order: true },
  });
  const nextOrder = (max._max.sort_order ?? -1) + 1;

  const playlist = await prisma.playlist.create({
    data: { user_id: args.userId, source_id: ytPlaylistId, name, sort_order: nextOrder },
    select: { id: true },
  });

  let videosProcessed = 0;

  for (let i = 0; i < feed.videos.length; i++) {
    const v = feed.videos[i];

    // Use the playlist owner's channel as the owning channel for all
    // videos. If the user later subscribes to the actual video's
    // channel, the refresh cron's upsert (keyed on video_unique_source)
    // reuses the existing row.
    const channelId = feed.channelId || 'UC_unknown';
    const channel = await prisma.channel.upsert({
      where: {
        channel_unique_source: {
          source_type: VideoPlatformType.YOUTUBE,
          source_id: channelId,
        },
      },
      create: {
        source_type: VideoPlatformType.YOUTUBE,
        source_id: channelId,
        name: feed.channelName || 'Unknown Channel',
        rss_url: buildRssUrl(channelId),
      },
      update: {},
      select: { id: true },
    });

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
        // Scrape path doesn't provide publishedAt — use current time
        // as a placeholder. The real date gets backfilled if the user
        // opens the video (fetchVideoSnapshot) or subscribes to the
        // channel (refresh cron).
        published_at: v.publishedAt ?? new Date(),
        thumbnail_url: v.thumbnailUrl,
        duration_seconds: v.durationSeconds,
      },
      update: {
        title: v.title,
        ...(isEmptyString(v.description) ? {} : { description: v.description }),
        ...(v.thumbnailUrl != null ? { thumbnail_url: v.thumbnailUrl } : {}),
        ...(v.durationSeconds != null ? { duration_seconds: v.durationSeconds } : {}),
      },
      select: { id: true },
    });

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

    // Mark newly added video as read so it doesn't appear unread.
    await prisma.userVideoConsumption.upsert({
      where: {
        user_video_consumption_unique_user_video: { user_id: args.userId, video_id: video.id },
      },
      create: { user_id: args.userId, video_id: video.id },
      update: {},
    });

    videosProcessed++;
  }

  return { playlistId: playlist.id, playlistName: name, videosProcessed };
}

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
  return `${baseName} (${Date.now()})`;
}
