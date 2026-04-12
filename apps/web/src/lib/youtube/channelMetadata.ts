/**
 * Client for the TranscriptAPI channel/latest endpoint. Requires an
 * API key (the endpoint is marked "Free" in the docs but still needs
 * auth). Returns the 15 most recent videos with thumbnails + view
 * counts, plus basic channel metadata (channelId, title, author).
 *
 * The endpoint does NOT return richer channel metadata (handle,
 * description, subscriber count, verified, logo) — those fields are
 * not available from this RSS-based endpoint. Channel logos would
 * need to come from scraping the YouTube channel page HTML, which is
 * a future enhancement.
 *
 * Docs: https://transcriptapi.com/docs/api/#channel-latest-rss
 */
import { isEmptyString } from '@/lib/string';

const BASE_URL = 'https://transcriptapi.com/api/v2';

// ── Response shapes (from real API call, not docs) ─────────────────

interface ChannelLatestThumbnail {
  url: string;
  width: string;
  height: string;
}

interface ChannelLatestVideo {
  videoId: string;
  title: string;
  channelId: string;
  author: string;
  published: string;
  updated: string;
  link: string;
  description: string | null;
  thumbnail: ChannelLatestThumbnail;
  viewCount: string;
  starRating: {
    count: string;
    average: string;
    min: string;
    max: string;
  };
}

interface ChannelLatestResponse {
  channel: {
    channelId: string;
    title: string;
    author: string;
    url: string;
    published: string;
  };
  results: ChannelLatestVideo[];
}

// ── Exported shapes ────────────────────────────────────────────────

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
 * Fetch the 15 most recent videos from TranscriptAPI's RSS-backed
 * endpoint. Returns per-video thumbnails + view counts.
 *
 * The `channel` parameter accepts @handles, channel URLs, or
 * UC-prefixed channel IDs — but in practice the API is more
 * reliable with @handles.
 *
 * Requires TRANSCRIPT_API_KEY. Throws on HTTP errors or network
 * failures — the caller should catch and decide whether to proceed
 * without metadata.
 */
export async function fetchChannelLatest(
  channelInput: string
): Promise<{ videos: ChannelVideoMeta[] }> {
  const apiKey = process.env.TRANSCRIPT_API_KEY;
  if (isEmptyString(apiKey)) {
    throw new Error('TRANSCRIPT_API_KEY is not set');
  }

  const url = `${BASE_URL}/youtube/channel/latest?channel=${encodeURIComponent(channelInput)}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`TranscriptAPI /channel/latest ${res.status}: ${body}`);
  }

  const data: ChannelLatestResponse = await res.json();

  const videos: ChannelVideoMeta[] = (data.results ?? []).map((v) => ({
    videoId: v.videoId,
    title: v.title,
    description: v.description ?? '',
    publishedAt: new Date(v.published),
    thumbnailUrl: v.thumbnail?.url || null,
    viewCount: v.viewCount != null ? parseInt(String(v.viewCount), 10) || null : null,
  }));

  return { videos };
}

/**
 * Construct a YouTube video thumbnail URL from the videoId.
 * Always available — doesn't require any API call.
 *
 * Uses `hqdefault.jpg` (480x360) which is guaranteed to exist for
 * all public videos.
 */
export function buildThumbnailUrl(videoId: string): string {
  return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
}
