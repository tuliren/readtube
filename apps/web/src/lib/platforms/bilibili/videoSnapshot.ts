/**
 * Fetch metadata for a single Bilibili video via the public
 * `api.bilibili.com/x/web-interface/view` endpoint. No auth required
 * for public videos.
 *
 * Returns a neutral VideoSnapshot so add-video can persist rows the
 * same way it does for YouTube.
 */
import type { VideoSnapshot } from '@/lib/platforms/types';

import { normalizeThumbnail } from './justOneApi';

const BILIBILI_VIEW_URL = 'https://api.bilibili.com/x/web-interface/view';
const BILIBILI_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36';

interface BilibiliViewResponse {
  code: number;
  message: string;
  data?: {
    bvid: string;
    title: string;
    desc?: string;
    pic?: string;
    pubdate?: number;
    duration?: number;
    owner?: {
      mid: number;
      name: string;
      face?: string;
    };
  };
}

export async function fetchBilibiliVideoSnapshot(bvid: string): Promise<VideoSnapshot> {
  const url = `${BILIBILI_VIEW_URL}?bvid=${encodeURIComponent(bvid)}`;
  const res = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': BILIBILI_USER_AGENT,
      Referer: 'https://www.bilibili.com/',
    },
  });
  if (!res.ok) {
    throw new Error(`Bilibili view API returned HTTP ${res.status}`);
  }
  const json = (await res.json()) as BilibiliViewResponse;
  if (json.code !== 0 || json.data == null) {
    throw new Error(`Bilibili view API error: code=${json.code} message=${json.message}`);
  }

  const data = json.data;
  const owner = data.owner;
  if (owner == null) {
    throw new Error('Bilibili view API response is missing owner info.');
  }

  const publishedAt =
    typeof data.pubdate === 'number' && data.pubdate > 0 ? new Date(data.pubdate * 1000) : null;
  const durationSeconds =
    typeof data.duration === 'number' && data.duration > 0 ? data.duration : null;

  return {
    videoId: data.bvid,
    title: data.title,
    description: data.desc ?? '',
    thumbnailUrl: normalizeThumbnail(data.pic ?? null),
    publishedAt,
    durationSeconds,
    channel: {
      sourceId: String(owner.mid),
      name: owner.name,
      // Bilibili has no @handle convention. Storing null keeps the
      // channel_unique_handle constraint usable for YouTube only.
      handle: null,
      // hdslb CDN returns 403 for `/bfs/face/...` over HTTPS — keep
      // the URL on HTTP so ChannelAvatar can load it (paired with
      // referrerPolicy="no-referrer" on the <img>).
      logoUrl: normalizeThumbnail(owner.face ?? null) || null,
    },
  };
}
