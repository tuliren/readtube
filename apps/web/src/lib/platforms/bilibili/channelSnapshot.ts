import type { ChannelSnapshot, SnapshotVideo } from '@/lib/platforms/types';

import { fetchBilibiliChannelVideos } from './channelVideos';
import { buildBilibiliVideoUrl } from './urls';
import { fetchBilibiliVideoSnapshot } from './videoSnapshot';

/**
 * Fetch channel meta + recent videos for a Bilibili uploader via the
 * signed JSON API. Two calls total:
 *
 *   1. `api.bilibili.com/x/space/wbi/arc/search` → newest-first list
 *      with title, description, thumbnail, pubdate, duration per item.
 *   2. `api.bilibili.com/x/web-interface/view` on the newest video →
 *      owner's name + avatar (used as channel name + logo).
 *
 * We deliberately reuse the view-endpoint call for channel meta
 * instead of hitting the separate `space/wbi/acc/info` endpoint — it
 * saves a second signed round-trip and lets us reuse the already-tested
 * `fetchBilibiliVideoSnapshot`. Bilibili has no `@handle` convention,
 * so `handle` is always null.
 *
 * NOTE: this path replaces the earlier Puppeteer scrape of
 * `space.bilibili.com/<mid>/upload/video`. The scrape path
 * (`channelScrape.ts` + `lib/puppeteer/`) is kept in the tree as
 * dormant fallback infrastructure. Bilibili's risk engine may still
 * return `code=-352` on certain IP ranges; callers should treat the
 * errors as "Channel not found or not accessible" at the UI layer.
 */
export async function fetchBilibiliChannelSnapshot(mid: string): Promise<ChannelSnapshot> {
  const overallStart = Date.now();
  console.info(`[bilibili/channelSnapshot] start mid=${mid}`);

  const listStart = Date.now();
  const videos = await fetchBilibiliChannelVideos(mid);
  console.info(
    `[bilibili/channelSnapshot] mid=${mid} arc/search done in ${Date.now() - listStart}ms: ${videos.length} videos`
  );

  if (videos.length === 0) {
    throw new Error(`Bilibili channel ${mid} has no videos on the arc/search list`);
  }

  const metaStart = Date.now();
  const firstVideoMeta = await fetchBilibiliVideoSnapshot(videos[0].videoId);
  console.info(`[bilibili/channelSnapshot] mid=${mid} view done in ${Date.now() - metaStart}ms`);

  const snapshotVideos: SnapshotVideo[] = videos.map((v) => ({
    videoId: v.videoId,
    title: v.title,
    description: v.description,
    publishedAt: v.publishedAt,
    link: buildBilibiliVideoUrl(v.videoId),
    thumbnailUrl: v.thumbnailUrl,
    durationSeconds: v.durationSeconds,
  }));

  console.info(
    `[bilibili/channelSnapshot] mid=${mid} done in ${Date.now() - overallStart}ms: name="${firstVideoMeta.channel.name}" videos=${snapshotVideos.length}`
  );
  return {
    channelId: mid,
    name: firstVideoMeta.channel.name,
    handle: null,
    logoUrl: firstVideoMeta.channel.logoUrl,
    videos: snapshotVideos,
  };
}
