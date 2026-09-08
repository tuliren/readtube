/**
 * Fetch metadata for a single Bilibili video and map it to the
 * neutral VideoSnapshot the add-video flow persists (same shape as
 * YouTube's). The view data comes from `fetchBilibiliVideoView`:
 * Bilibili directly when it lets us through, JustOneAPI's video-detail
 * endpoint when it doesn't.
 */
import type { VideoSnapshot } from '@/lib/platforms/types';

import { normalizeThumbnail } from './justOneApi';
import { fetchBilibiliVideoView } from './videoView';

export async function fetchBilibiliVideoSnapshot(bvid: string): Promise<VideoSnapshot> {
  const data = await fetchBilibiliVideoView(bvid);
  const owner = data.owner;
  if (owner == null) {
    throw new Error('Bilibili view data is missing owner info.');
  }

  const publishedAt =
    data.pubdate != null && data.pubdate > 0 ? new Date(data.pubdate * 1000) : null;
  const durationSeconds = data.duration != null && data.duration > 0 ? data.duration : null;

  return {
    videoId: data.bvid,
    title: data.title,
    description: data.desc ?? '',
    thumbnailUrl: normalizeThumbnail(data.pic),
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
      logoUrl: normalizeThumbnail(owner.face) || null,
    },
  };
}
