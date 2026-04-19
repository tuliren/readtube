import { VideoPlatformType, prisma } from '@readtube/database';

import type { RssChannel } from '@/lib/platforms/youtube/channelRss';
import { fetchRssFeed, isYouTubeShort } from '@/lib/platforms/youtube/channelRss';
import { UNKNOWN_CHANNEL_NAME } from '@/lib/platforms/youtube/constants';
import { PrivatePlaylistError, scrapePlaylist } from '@/lib/platforms/youtube/playlistScrape';
import { buildPlaylistRssUrl, buildRssUrl, extractPlaylistId } from '@/lib/platforms/youtube/urls';
import { isEmptyString } from '@/lib/string';

export interface AddPlaylistResult {
  playlistId: string;
  playlistName: string;
  videosProcessed: number;
}

export class AddPlaylistError extends Error {
  constructor(
    message: string,
    public readonly code: 'INVALID_URL' | 'FETCH_FAILED' | 'PRIVATE_PLAYLIST'
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
  /** The uploader's actual channel — not the playlist owner's. Falls
   *  back to feed-level channel when the source didn't expose per-video
   *  info. */
  channelId: string | null;
  channelName: string | null;
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
      // For playlist RSS feeds the feed-level <title> is the playlist
      // title; the playlist owner's channel name comes from <author>.
      channelName: rss.authorName ?? rss.name,
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
          channelId: v.channelId,
          channelName: v.channelName,
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
      channelId: v.channelId,
      channelName: v.channelName,
    })),
  };
}

/**
 * Adds a YouTube playlist to the user's library. Tries the playlist
 * RSS feed first, then falls back to scraping the playlist page.
 * Creates a Playlist row and for each video upserts a shadow Channel
 * + Video + PlaylistVideo row.
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

  // Idempotent: if the user already has this YouTube playlist, return
  // the existing row without re-fetching. The dialog will navigate to
  // its page, which is the same behavior as a fresh add.
  const existing = await prisma.playlist.findFirst({
    where: { user_id: args.userId, source_id: ytPlaylistId },
    select: { id: true, name: true },
  });
  if (existing != null) {
    return { playlistId: existing.id, playlistName: existing.name, videosProcessed: 0 };
  }

  let feed: PlaylistFeed;
  try {
    feed = await fetchPlaylistData(ytPlaylistId);
  } catch (err) {
    console.error('[add-playlist] fetchPlaylistData failed:', err);
    if (err instanceof PrivatePlaylistError) {
      throw new AddPlaylistError(err.message, 'PRIVATE_PLAYLIST');
    }
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
    data: {
      user_id: args.userId,
      source_id: ytPlaylistId,
      name,
      sort_order: nextOrder,
    },
    select: { id: true },
  });

  let videosProcessed = 0;

  for (let i = 0; i < feed.videos.length; i++) {
    const v = feed.videos[i];

    // Use the video's actual uploader channel (from per-entry byline)
    // rather than the playlist owner. Falls back to the feed-level
    // channel when the source didn't expose per-video info.
    const channelId = v.channelId || feed.channelId || 'UC_unknown';
    const channelName = v.channelName || feed.channelName || UNKNOWN_CHANNEL_NAME;
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
        name: channelName,
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
        // source_type must match the `where` clause so Prisma uses a
        // native Postgres upsert (CLAUDE.md).
        source_type: VideoPlatformType.YOUTUBE,
        source_id: v.videoId,
        title: v.title,
        description: v.description,
        // published_at is nullable — scrape paths can legitimately
        // return null. A later source (fetchVideoSnapshot on open,
        // refresh cron) will backfill via the update branch.
        published_at: v.publishedAt,
        thumbnail_url: v.thumbnailUrl,
        duration_seconds: v.durationSeconds,
      },
      update: {
        title: v.title,
        ...(isEmptyString(v.description) ? {} : { description: v.description }),
        // Backfill published_at whenever this source produced a real
        // date — skips the field otherwise so existing values (null
        // or real) are preserved.
        ...(v.publishedAt != null ? { published_at: v.publishedAt } : {}),
        ...(v.thumbnailUrl != null ? { thumbnail_url: v.thumbnailUrl } : {}),
        ...(v.durationSeconds != null ? { duration_seconds: v.durationSeconds } : {}),
      },
      select: { id: true },
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

  // Mark every video the user just pulled in as already-read. Prefer
  // the real max(published_at) + 1s so the watermark reflects actual
  // content times — videos published after this moment will correctly
  // show as unread. When the scrape path produces no publish dates
  // (YouTube watch-page playlists), fall back to `new Date()` so at
  // least the playlist-add moment anchors the watermark; future
  // additions will have `created_at > read_at` and surface as unread.
  // (`videoNewerThanWatermark` compares against `created_at` when
  // `published_at` is null, so the fallback keeps the comparison
  // coherent.)
  if (videosProcessed > 0) {
    const latest = await prisma.playlistVideo.findFirst({
      where: { playlist_id: playlist.id, video: { published_at: { not: null } } },
      select: { video: { select: { published_at: true } } },
      orderBy: { video: { published_at: 'desc' } },
    });
    const readAt =
      latest?.video.published_at != null
        ? new Date(latest.video.published_at.getTime() + 1000)
        : new Date();
    await prisma.playlist.update({
      where: { id: playlist.id },
      data: { read_at: readAt },
    });
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
