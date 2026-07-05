/**
 * Client for the official YouTube Data API v3, authenticated with our
 * own GCP project's API key (`YOUTUBE_API_KEY`). When the key is set,
 * this is the *primary* metadata source for both channel snapshots
 * and individual video snapshots — the scrape / RSS / TranscriptAPI
 * paths remain as fallbacks (see channelSnapshot.ts and
 * videoSnapshot.ts for the orchestration).
 *
 * Why primary: the API is served from Google's own infrastructure, so
 * it is immune to the watch-page/RSS soft-blocking of hosting IPs, it
 * returns full descriptions and exact publish timestamps (RSS
 * truncates neither but is capped at 15 entries; scrape truncates
 * both), and it costs nothing beyond the free daily quota.
 *
 * Quota cost per call (default project quota is 10,000 units/day):
 *   - channel snapshot: 4 units (channels 1 + uploads playlistItems 1
 *     + shorts playlistItems 1 + videos 1)
 *   - video snapshot: 3 units (videos 1 + members-only playlistItems 1
 *     + channels 1)
 *   - playlist fetch: 3 units (playlists 1 + playlistItems 1 + videos 1)
 *   - scheduled-video check: 1 unit (videos 1)
 *
 * Members-only videos (verified empirically against channels with
 * members content): the `UU…` uploads playlist structurally excludes
 * them, so they can never enter a channel snapshot through this path
 * — no badge scraping needed. They live in their own playlist family
 * (`UUMF…` long-form, `UUMV…` live, `UUMS…` shorts, `UUMO…` = union
 * of all three), which is also the *only* API-side signal:
 * `videos.list` returns them as indistinguishable public videos. The
 * add-video path therefore checks the `UUMO…` playlist and rejects
 * members-only videos with `MembersOnlyVideoError` — ingesting one
 * would only sticky-lock `transcript_unavailable` on a row whose
 * transcript fetch is guaranteed to fail.
 *
 * Docs: https://developers.google.com/youtube/v3/docs
 */
import {
  type ChannelSnapshot,
  MembersOnlyVideoError,
  type SnapshotVideo,
  type VideoSnapshot,
} from '@/lib/platforms/types';
import { isEmptyString } from '@/lib/string';

import { UNKNOWN_CHANNEL_NAME, UNKNOWN_VIDEO_TITLE } from './constants';
import { parseIsoDurationSeconds } from './isoDuration';
import { buildThumbnailUrl } from './urls';

const BASE_URL = 'https://www.googleapis.com/youtube/v3';

/** Page size for playlistItems.list; also the max ids per videos.list call. */
const MAX_RESULTS = 50;

/**
 * Duration threshold (seconds) for filtering Shorts when the
 * shorts-only playlist lookup fails. Mirrors the scrape-only
 * fallback in channelSnapshot.ts.
 */
const SHORTS_DURATION_THRESHOLD = 60;

/** True when `YOUTUBE_API_KEY` is set — the Data API tiers only run then. */
export function isDataApiConfigured(): boolean {
  return !isEmptyString(process.env.YOUTUBE_API_KEY);
}

/**
 * Thrown for non-2xx Data API responses. Carries the HTTP status so
 * callers can distinguish "playlist doesn't exist" (404) from quota /
 * auth / transient failures.
 */
export class DataApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'DataApiError';
    this.status = status;
    // See SubtitleFetchError in platforms/types.ts — required for
    // `instanceof` to survive the es5 `extends Error` transpilation.
    Object.setPrototypeOf(this, DataApiError.prototype);
  }
}

// ── Response shapes (the subsets of fields we consume) ─────────────

interface ThumbnailMap {
  [size: string]: { url?: string } | undefined;
}

interface ChannelsListResponse {
  items?: Array<{
    id?: string;
    snippet?: {
      title?: string;
      /** Handle-based custom URL, e.g. "@mkbhd" (lowercased). */
      customUrl?: string;
      thumbnails?: ThumbnailMap;
    };
    contentDetails?: {
      relatedPlaylists?: { uploads?: string };
    };
  }>;
}

interface PlaylistItemsListResponse {
  items?: Array<{
    snippet?: {
      title?: string;
      description?: string;
      thumbnails?: ThumbnailMap;
      /** The video's actual uploader — not the playlist owner. */
      videoOwnerChannelId?: string;
      videoOwnerChannelTitle?: string;
    };
    contentDetails?: { videoId?: string; videoPublishedAt?: string };
    status?: { privacyStatus?: string };
  }>;
}

interface PlaylistsListResponse {
  items?: Array<{
    id?: string;
    snippet?: {
      title?: string;
      /** The playlist owner's channel. */
      channelId?: string;
      channelTitle?: string;
    };
  }>;
}

interface VideosListResponse {
  items?: Array<{
    id?: string;
    snippet?: {
      title?: string;
      description?: string;
      publishedAt?: string;
      channelId?: string;
      channelTitle?: string;
      /** "none" | "live" | "upcoming" */
      liveBroadcastContent?: string;
      thumbnails?: ThumbnailMap;
    };
    contentDetails?: { duration?: string };
    liveStreamingDetails?: { scheduledStartTime?: string };
  }>;
}

// ── Internal helpers ───────────────────────────────────────────────

async function dataApiFetch<T>(resource: string, params: Record<string, string>): Promise<T> {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (isEmptyString(apiKey)) {
    throw new Error('YOUTUBE_API_KEY is not set');
  }

  const query = new URLSearchParams({ ...params, key: apiKey });
  // See channelRss.ts for why we opt out of Next.js's fetch cache —
  // these run inside workflow steps outside a request context.
  const res = await fetch(`${BASE_URL}/${resource}?${query.toString()}`, { cache: 'no-store' });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new DataApiError(`YouTube Data API /${resource} ${res.status}: ${body}`, res.status);
  }
  return (await res.json()) as T;
}

function pickThumbnailUrl(thumbnails: ThumbnailMap | undefined): string | null {
  if (thumbnails == null) {
    return null;
  }
  // "high" is 480x360 for videos (same asset as hqdefault.jpg) and
  // 800x800 for channels — the sizes the rest of the app expects.
  const preferred = thumbnails.high ?? thumbnails.medium ?? thumbnails.default;
  return preferred?.url ?? null;
}

/**
 * `snippet.customUrl` is "@handle" for handle-based channels but can
 * be a bare legacy custom name on old channels — only treat it as a
 * handle when it has the leading `@`.
 */
function extractHandleFromCustomUrl(customUrl: string | undefined): string | null {
  if (customUrl == null || !customUrl.startsWith('@')) {
    return null;
  }
  return customUrl;
}

function parsePublishedAt(raw: string | undefined): Date | null {
  if (raw == null) {
    return null;
  }
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Video ids of the channel's Shorts, read from the shorts-only
 * "UUSH…" playlist (the uploads playlist "UU…" with the prefix
 * swapped). Undocumented but stable — it's what powers the channel's
 * /shorts tab. One page suffices: any Short recent enough to appear
 * in the last `MAX_RESULTS` uploads is by definition among the
 * `MAX_RESULTS` most recent Shorts.
 *
 * Returns:
 *   - a Set of video ids on success;
 *   - an empty Set on 404 (the channel has no Shorts, so the playlist
 *     was never created);
 *   - null on any other failure, telling the caller to fall back to
 *     the duration heuristic.
 */
async function fetchShortsVideoIds(channelId: string): Promise<Set<string> | null> {
  const shortsPlaylistId = `UUSH${channelId.slice(2)}`;
  try {
    const res = await dataApiFetch<PlaylistItemsListResponse>('playlistItems', {
      part: 'contentDetails',
      playlistId: shortsPlaylistId,
      maxResults: String(MAX_RESULTS),
    });
    const ids = (res.items ?? [])
      .map((item) => item.contentDetails?.videoId)
      .filter((id): id is string => id != null);
    return new Set(ids);
  } catch (err) {
    if (err instanceof DataApiError && err.status === 404) {
      return new Set();
    }
    console.warn(`[youtube] Data API shorts playlist fetch failed for ${channelId}:`, err);
    return null;
  }
}

/**
 * Fetch the channel's recent uploads as ingest-ready SnapshotVideos.
 * Ordering follows the uploads playlist (newest first). Drops:
 *   - non-public playlist entries (private / deleted uploads);
 *   - Shorts (via the shorts playlist, or duration ≤60s when that
 *     lookup fails);
 *   - live / upcoming broadcasts (`liveBroadcastContent !== 'none'`)
 *     — completed livestream VODs report "none" and are kept;
 *   - future-dated entries, mirroring the RSS path's premiere guard.
 */
async function fetchUploadedVideos(
  uploadsPlaylistId: string,
  channelId: string
): Promise<SnapshotVideo[]> {
  const itemsRes = await dataApiFetch<PlaylistItemsListResponse>('playlistItems', {
    part: 'contentDetails,status',
    playlistId: uploadsPlaylistId,
    maxResults: String(MAX_RESULTS),
  });
  const videoIds = (itemsRes.items ?? [])
    .filter((item) => item.status?.privacyStatus === 'public')
    .map((item) => item.contentDetails?.videoId)
    .filter((id): id is string => id != null);
  if (videoIds.length === 0) {
    return [];
  }

  const [shortsIds, videosRes] = await Promise.all([
    fetchShortsVideoIds(channelId),
    dataApiFetch<VideosListResponse>('videos', {
      part: 'snippet,contentDetails',
      id: videoIds.join(','),
    }),
  ]);

  const detailsById = new Map(
    (videosRes.items ?? [])
      .filter((item) => item.id != null)
      .map((item) => [item.id as string, item])
  );

  const now = Date.now();
  const videos: SnapshotVideo[] = [];
  for (const videoId of videoIds) {
    const details = detailsById.get(videoId);
    // Missing from videos.list despite a public playlist entry —
    // deleted between the two calls, or otherwise inaccessible.
    if (details?.snippet == null) {
      continue;
    }
    if ((details.snippet.liveBroadcastContent ?? 'none') !== 'none') {
      continue;
    }
    const durationSeconds = parseIsoDurationSeconds(details.contentDetails?.duration);
    const isShort =
      shortsIds != null
        ? shortsIds.has(videoId)
        : durationSeconds != null && durationSeconds <= SHORTS_DURATION_THRESHOLD;
    if (isShort) {
      continue;
    }
    const publishedAt = parsePublishedAt(details.snippet.publishedAt);
    if (publishedAt != null && publishedAt.getTime() > now) {
      continue;
    }
    videos.push({
      videoId,
      title: details.snippet.title ?? UNKNOWN_VIDEO_TITLE,
      description: details.snippet.description ?? '',
      publishedAt,
      link: `https://www.youtube.com/watch?v=${videoId}`,
      thumbnailUrl: pickThumbnailUrl(details.snippet.thumbnails) ?? buildThumbnailUrl(videoId),
      durationSeconds,
    });
  }
  return videos;
}

/**
 * True when the video sits in the channel's members-only playlist
 * (`UUMO…` — the union of members long-form/live/shorts). This is
 * the only API-side members-only signal: `videos.list` returns such
 * videos as indistinguishable public videos, and the `UU…` uploads
 * playlist simply omits them.
 *
 * Best-effort: a 404 means the channel has no members content, and
 * any other failure is logged and treated as "not members-only" —
 * a flaky bonus check must never block a legitimate add.
 */
async function isMembersOnlyVideo(videoId: string, channelId: string): Promise<boolean> {
  const membersPlaylistId = `UUMO${channelId.slice(2)}`;
  try {
    const res = await dataApiFetch<PlaylistItemsListResponse>('playlistItems', {
      part: 'id',
      playlistId: membersPlaylistId,
      videoId,
      maxResults: '1',
    });
    return (res.items ?? []).length > 0;
  } catch (err) {
    if (err instanceof DataApiError && err.status === 404) {
      return false;
    }
    console.warn(`[youtube] Data API members-only check failed for ${videoId}:`, err);
    return false;
  }
}

// ── Exported fetchers ──────────────────────────────────────────────

/**
 * Channel reference the Data API can resolve directly: a UC-prefixed
 * channel id, or an @handle (channels.list `forHandle` resolves it in
 * the same request — no scrape needed for handle → UC resolution).
 */
export interface DataApiChannelRef {
  channelId?: string;
  /** Handle with or without the leading `@`. */
  handle?: string;
}

/**
 * Build a full ChannelSnapshot from the Data API alone. Throws on any
 * upstream failure or when the channel doesn't exist — the caller
 * (channelSnapshot.ts) catches and falls back to scrape + RSS.
 */
export async function fetchChannelViaDataApi(ref: DataApiChannelRef): Promise<ChannelSnapshot> {
  const refParams: Record<string, string> | null =
    ref.channelId != null
      ? { id: ref.channelId }
      : ref.handle != null
        ? { forHandle: ref.handle }
        : null;
  if (refParams == null) {
    throw new Error('fetchChannelViaDataApi requires a channelId or handle');
  }
  const refInput = ref.channelId ?? ref.handle;
  console.info(`[youtube] Fetching channel via Data API: ${refInput}`);

  const channelsRes = await dataApiFetch<ChannelsListResponse>('channels', {
    part: 'snippet,contentDetails',
    ...refParams,
  });
  const channel = channelsRes.items?.[0];
  if (channel?.id == null || channel.snippet == null) {
    throw new Error(`YouTube Data API returned no channel for ${refInput}`);
  }

  const uploadsPlaylistId = channel.contentDetails?.relatedPlaylists?.uploads;
  const videos =
    uploadsPlaylistId != null ? await fetchUploadedVideos(uploadsPlaylistId, channel.id) : [];

  return {
    channelId: channel.id,
    name: channel.snippet.title ?? UNKNOWN_CHANNEL_NAME,
    handle: extractHandleFromCustomUrl(channel.snippet.customUrl),
    logoUrl: pickThumbnailUrl(channel.snippet.thumbnails),
    videos,
  };
}

/**
 * Build a VideoSnapshot for the add-video flow from the Data API.
 * One videos.list call for the video itself, plus a best-effort
 * channels.list call for the two fields videos.list doesn't carry
 * (channel handle + logo) — enrichment failure degrades to nulls
 * rather than failing the whole fetch.
 *
 * Throws when the video doesn't exist (private / deleted / bad id) or
 * on upstream failure — the caller (videoSnapshot.ts) catches and
 * falls back to the watch-page scrape.
 */
export async function fetchVideoViaDataApi(videoId: string): Promise<VideoSnapshot> {
  console.info(`[youtube] Fetching video via Data API: ${videoId}`);

  const videosRes = await dataApiFetch<VideosListResponse>('videos', {
    part: 'snippet,contentDetails',
    id: videoId,
  });
  const item = videosRes.items?.[0];
  if (item?.snippet == null) {
    throw new Error(`YouTube Data API returned no video for ${videoId}`);
  }
  const snippet = item.snippet;
  if (isEmptyString(snippet.title) || isEmptyString(snippet.channelId)) {
    throw new Error(`YouTube Data API video ${videoId} is missing title or channel id`);
  }
  // Captured as locals because the narrowing from the guard above
  // doesn't survive into the enrichment closure below.
  const title = snippet.title;
  const channelId = snippet.channelId;

  let handle: string | null = null;
  let logoUrl: string | null = null;
  const [membersOnly] = await Promise.all([
    isMembersOnlyVideo(videoId, channelId),
    (async () => {
      try {
        const channelsRes = await dataApiFetch<ChannelsListResponse>('channels', {
          part: 'snippet',
          id: channelId,
        });
        const channelSnippet = channelsRes.items?.[0]?.snippet;
        handle = extractHandleFromCustomUrl(channelSnippet?.customUrl);
        logoUrl = pickThumbnailUrl(channelSnippet?.thumbnails);
      } catch (err) {
        console.warn(`[youtube] Data API channel enrichment failed for ${channelId}:`, err);
      }
    })(),
  ]);
  if (membersOnly) {
    throw new MembersOnlyVideoError(
      'This video is members-only. Its transcript is only available to channel members, so it cannot be added.'
    );
  }

  return {
    videoId,
    title,
    description: snippet.description ?? '',
    thumbnailUrl: pickThumbnailUrl(snippet.thumbnails) ?? buildThumbnailUrl(videoId),
    publishedAt: parsePublishedAt(snippet.publishedAt),
    durationSeconds: parseIsoDurationSeconds(item.contentDetails?.duration),
    channel: {
      sourceId: channelId,
      name: snippet.channelTitle ?? UNKNOWN_CHANNEL_NAME,
      handle,
      logoUrl,
    },
  };
}

/** Scheduled/upcoming state of a single video, for scheduledVideo.ts. */
export interface DataApiScheduledStatus {
  isUpcoming: boolean;
  scheduledStartTime: Date | null;
}

/**
 * Scheduled-premiere / upcoming-livestream check for a single video.
 * `videos.list` exposes the same signals the watch-page scrape
 * reconstructs from raw HTML — `liveBroadcastContent: 'upcoming'`
 * (vs the scrape's `"isUpcoming":true`) and
 * `liveStreamingDetails.scheduledStartTime` (vs
 * `liveBroadcastDetails.startTimestamp`) — but structured. 1 unit.
 *
 * Returns null when the video is missing from the response: deleted
 * and private videos are omitted by the API, and "not visible" must
 * not be read as "not scheduled" — the caller falls through to the
 * legacy strategies. Throws on request failure (quota, network).
 */
export async function fetchScheduledStatusViaDataApi(
  videoId: string
): Promise<DataApiScheduledStatus | null> {
  console.info(`[youtube] Checking scheduled status via Data API: ${videoId}`);

  const res = await dataApiFetch<VideosListResponse>('videos', {
    part: 'snippet,liveStreamingDetails',
    id: videoId,
  });
  const item = res.items?.[0];
  if (item?.snippet == null) {
    return null;
  }
  const isUpcoming = item.snippet.liveBroadcastContent === 'upcoming';
  return {
    isUpcoming,
    scheduledStartTime: isUpcoming
      ? parsePublishedAt(item.liveStreamingDetails?.scheduledStartTime)
      : null,
  };
}

/**
 * A playlist entry ready for the add-playlist flow. `channelId` /
 * `channelName` are the video's actual uploader (a playlist can mix
 * videos from many channels) — not the playlist owner. Field-for-field
 * compatible with add-playlist's internal PlaylistVideo shape.
 */
export interface DataApiPlaylistVideo {
  videoId: string;
  title: string;
  description: string;
  publishedAt: Date | null;
  thumbnailUrl: string | null;
  durationSeconds: number | null;
  channelId: string | null;
  channelName: string | null;
}

export interface DataApiPlaylist {
  title: string;
  /** The playlist owner's channel. */
  channelId: string;
  channelName: string;
  videos: DataApiPlaylistVideo[];
}

/**
 * Fetch a playlist's metadata + up to 50 entries for the add-playlist
 * flow. Richer than both legacy sources combined: the RSS path has
 * publish dates but no durations, the scrape path has durations but
 * no publish dates — this has both, plus full descriptions and the
 * per-video uploader channel.
 *
 * Filtering matches the channel-uploads path where it applies:
 * non-public entries, live/upcoming broadcasts, and future-dated
 * videos are dropped. Shorts are dropped by the ≤60s duration
 * heuristic — the UUSH shorts-playlist trick doesn't transfer here
 * because a playlist can mix videos from many owner channels.
 *
 * Throws when the playlist is invisible to the API — nonexistent or
 * private — so the caller can fall back to RSS/scrape, which is what
 * produces the proper private-playlist error. (Auto-generated Mixes
 * (RD…) ARE served by the API — verified live — including per-video
 * uploader channels.)
 */
export async function fetchPlaylistViaDataApi(playlistId: string): Promise<DataApiPlaylist> {
  console.info(`[youtube] Fetching playlist via Data API: ${playlistId}`);

  const playlistsRes = await dataApiFetch<PlaylistsListResponse>('playlists', {
    part: 'snippet',
    id: playlistId,
  });
  const playlist = playlistsRes.items?.[0];
  if (playlist?.snippet == null) {
    throw new Error(`YouTube Data API returned no playlist for ${playlistId}`);
  }

  const itemsRes = await dataApiFetch<PlaylistItemsListResponse>('playlistItems', {
    part: 'snippet,contentDetails,status',
    playlistId,
    maxResults: String(MAX_RESULTS),
  });
  const publicItems = (itemsRes.items ?? []).filter(
    (item) => item.status?.privacyStatus === 'public' && item.contentDetails?.videoId != null
  );

  const videoIds = publicItems
    .map((item) => item.contentDetails?.videoId)
    .filter((id): id is string => id != null);
  const videosRes =
    videoIds.length > 0
      ? await dataApiFetch<VideosListResponse>('videos', {
          part: 'snippet,contentDetails',
          id: videoIds.join(','),
        })
      : { items: [] };
  const detailsById = new Map(
    (videosRes.items ?? [])
      .filter((item) => item.id != null)
      .map((item) => [item.id as string, item])
  );

  const now = Date.now();
  const videos: DataApiPlaylistVideo[] = [];
  for (const item of publicItems) {
    const videoId = item.contentDetails?.videoId;
    if (videoId == null) {
      continue;
    }
    const details = detailsById.get(videoId);
    // Missing from videos.list despite a public playlist entry —
    // deleted between the two calls, or otherwise inaccessible.
    if (details?.snippet == null) {
      continue;
    }
    if ((details.snippet.liveBroadcastContent ?? 'none') !== 'none') {
      continue;
    }
    const durationSeconds = parseIsoDurationSeconds(details.contentDetails?.duration);
    if (durationSeconds != null && durationSeconds <= SHORTS_DURATION_THRESHOLD) {
      continue;
    }
    const publishedAt =
      parsePublishedAt(details.snippet.publishedAt) ??
      parsePublishedAt(item.contentDetails?.videoPublishedAt);
    if (publishedAt != null && publishedAt.getTime() > now) {
      continue;
    }
    videos.push({
      videoId,
      title: details.snippet.title ?? item.snippet?.title ?? UNKNOWN_VIDEO_TITLE,
      description: details.snippet.description ?? item.snippet?.description ?? '',
      publishedAt,
      thumbnailUrl:
        pickThumbnailUrl(details.snippet.thumbnails) ??
        pickThumbnailUrl(item.snippet?.thumbnails) ??
        buildThumbnailUrl(videoId),
      durationSeconds,
      channelId: details.snippet.channelId ?? item.snippet?.videoOwnerChannelId ?? null,
      channelName: details.snippet.channelTitle ?? item.snippet?.videoOwnerChannelTitle ?? null,
    });
  }

  return {
    title: playlist.snippet.title ?? '',
    channelId: playlist.snippet.channelId ?? '',
    channelName: playlist.snippet.channelTitle ?? UNKNOWN_CHANNEL_NAME,
    videos,
  };
}
