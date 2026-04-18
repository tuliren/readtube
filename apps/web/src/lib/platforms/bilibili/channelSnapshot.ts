import type { ChannelSnapshot, SnapshotVideo } from '@/lib/platforms/types';

import { scrapeBilibiliChannel } from './channelScrape';
import { buildBilibiliVideoUrl } from './urls';
import { fetchBilibiliVideoSnapshot } from './videoSnapshot';

/**
 * Maximum number of videos to include in an initial channel snapshot.
 * Matches the rough size of a YouTube RSS feed (~15 entries) so the
 * initial subscription views are comparable across platforms.
 */
const MAX_VIDEOS_PER_SNAPSHOT = 15;

/**
 * Max concurrent per-video HTTP fan-out to api.bilibili.com.
 * 5 is well under Bilibili's public rate limit and keeps the total
 * snapshot time well under a few seconds for a 15-video channel.
 */
const FANOUT_CONCURRENCY = 5;

/**
 * Fetch channel meta + recent videos for a Bilibili uploader. Two-phase:
 *   1. Scrape the /upload/video space page to get BV ids in
 *      publication-date-descending order.
 *   2. Fan out to the public `web-interface/view` API for per-video
 *      metadata (title, description, duration, thumbnail, pubdate).
 *
 * Channel name/avatar are sourced from the first video's `owner` (the
 * same API call already gives us both), so this needs one network call
 * per video and no separate user-info API. Bilibili has no handle
 * convention — `handle` is always null.
 */
export async function fetchBilibiliChannelSnapshot(mid: string): Promise<ChannelSnapshot> {
  const scraped = await scrapeBilibiliChannel(mid);
  const bvids = scraped.videos.slice(0, MAX_VIDEOS_PER_SNAPSHOT).map((v) => v.videoId);

  if (bvids.length === 0) {
    throw new Error(`Bilibili channel ${mid} has no videos on the /upload/video page`);
  }

  const snapshots = await fanOutVideoSnapshots(bvids);

  // Channel-level info comes from the first successfully fetched video.
  const firstOk = snapshots.find((s) => s != null);
  if (firstOk == null) {
    throw new Error(`All video snapshots failed for Bilibili channel ${mid}`);
  }

  const videos: SnapshotVideo[] = [];
  for (const snap of snapshots) {
    if (snap == null) {
      continue;
    }
    videos.push({
      videoId: snap.videoId,
      title: snap.title,
      description: snap.description,
      publishedAt: snap.publishedAt,
      link: buildBilibiliVideoUrl(snap.videoId),
      thumbnailUrl: snap.thumbnailUrl,
      durationSeconds: snap.durationSeconds,
    });
  }

  return {
    channelId: mid,
    name: firstOk.channel.name,
    handle: null,
    logoUrl: firstOk.channel.logoUrl,
    videos,
  };
}

/**
 * Run `fetchBilibiliVideoSnapshot` over `bvids` with a small concurrency
 * cap. Returns results in the same order as the input; individual
 * failures are logged and mapped to null so one bad BV id doesn't sink
 * the whole snapshot.
 */
async function fanOutVideoSnapshots(bvids: string[]) {
  const out: (Awaited<ReturnType<typeof fetchBilibiliVideoSnapshot>> | null)[] = new Array(
    bvids.length
  ).fill(null);
  let cursor = 0;

  async function worker() {
    while (true) {
      const i = cursor++;
      if (i >= bvids.length) {
        return;
      }
      try {
        out[i] = await fetchBilibiliVideoSnapshot(bvids[i]);
      } catch (err) {
        console.warn(`[bilibili/channelSnapshot] fetch failed for ${bvids[i]}:`, err);
      }
    }
  }

  const workers = new Array(Math.min(FANOUT_CONCURRENCY, bvids.length))
    .fill(null)
    .map(() => worker());
  await Promise.all(workers);
  return out;
}
