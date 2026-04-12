/**
 * Client for the TranscriptAPI channel endpoints. Both are free (no
 * API key needed). We use /youtube/channel/latest to get the
 * channel's metadata (handle, description, subscriber count,
 * verified, logo) AND the 15 most recent videos with thumbnails +
 * view counts in a single round-trip.
 *
 * Docs:
 *   - Resolve: https://transcriptapi.com/docs/api/#resolve-channel
 *   - Latest:  https://transcriptapi.com/docs/api/#channel-latest-rss
 */

const BASE_URL = 'https://transcriptapi.com/api/v2';

// ── Response shapes (from API docs) ────────────────────────────────

interface ChannelThumbnail {
  url: string;
  width: number;
  height: number;
}

interface ChannelLatestVideo {
  videoId: string;
  title: string;
  channelId: string;
  author: string;
  published: string;
  updated: string;
  link: string;
  description: string;
  thumbnail: string;
  viewCount: number;
  starRating: {
    count: number;
    average: number;
    min: number;
    max: number;
  };
}

interface ChannelLatestResponse {
  channelId: string;
  title: string;
  handle: string;
  url: string;
  description: string;
  subscriberCount: number;
  verified: boolean;
  rssUrl: string;
  thumbnails: ChannelThumbnail[];
  videos: ChannelLatestVideo[];
}

// ── Exported shapes ────────────────────────────────────────────────

export interface ChannelMetadata {
  channelId: string;
  name: string;
  handle: string | null;
  description: string | null;
  subscriberCount: number | null;
  verified: boolean;
  logoUrl: string | null;
}

export interface ChannelVideoMeta {
  videoId: string;
  title: string;
  description: string;
  publishedAt: Date;
  thumbnailUrl: string | null;
  viewCount: number | null;
}

// ── Functions ──────────────────────────────────────────────────────

/**
 * Fetch channel metadata and the 15 most recent videos from
 * TranscriptAPI's free RSS-backed endpoint. Returns both the
 * channel-level metadata (handle, description, logo, subscriber
 * count, verified) and per-video thumbnails + view counts.
 *
 * Throws on HTTP errors or network failures — the caller should
 * catch and decide whether to proceed without metadata.
 */
export async function fetchChannelLatest(
  channelId: string
): Promise<{ channel: ChannelMetadata; videos: ChannelVideoMeta[] }> {
  const url = `${BASE_URL}/youtube/channel/latest?channel=${encodeURIComponent(channelId)}`;
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`TranscriptAPI /channel/latest ${res.status}: ${body}`);
  }

  const data: ChannelLatestResponse = await res.json();

  // Pick the largest thumbnail as the logo URL. The array typically
  // has 48px, 88px, and 176px entries — we want the biggest for
  // flexibility. Falls back to null if the array is empty.
  const logo =
    data.thumbnails?.slice().sort((a, b) => (b.width ?? 0) - (a.width ?? 0))[0]?.url ?? null;

  const channel: ChannelMetadata = {
    channelId: data.channelId,
    name: data.title,
    handle: data.handle || null,
    description: data.description || null,
    subscriberCount: data.subscriberCount ?? null,
    verified: data.verified ?? false,
    logoUrl: logo,
  };

  const videos: ChannelVideoMeta[] = (data.videos ?? []).map((v) => ({
    videoId: v.videoId,
    title: v.title,
    description: v.description ?? '',
    publishedAt: new Date(v.published),
    thumbnailUrl: v.thumbnail || null,
    viewCount: v.viewCount ?? null,
  }));

  return { channel, videos };
}
