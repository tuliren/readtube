import type { ChannelSnapshot, SnapshotVideo } from '@/lib/platforms/types';

import { fetchBilibiliChannelViaJustOneApi } from './justOneApi';
import { buildBilibiliVideoUrl } from './urls';
import { fetchBilibiliVideoSnapshot } from './videoSnapshot';

/**
 * Fetch channel meta + recent videos for a Bilibili uploader via
 * JustOneAPI (third-party wrapper at justoneapi.com). We delegate the
 * IP-reputation / risk-control problem to them — they collect the
 * data on their own infra and expose a simple token-auth HTTP API.
 *
 * JustOneAPI's envelope doesn't include the uploader's avatar, so we
 * fall back to one `x/web-interface/view` call on the newest bvid to
 * backfill channel name/avatar whenever either is missing.
 *
 * The Puppeteer-based scraper at `./channelScrape.ts` (+
 * `lib/puppeteer/`) stays in the tree as a dormant fallback if we
 * need to route through a headless browser again.
 */
export async function fetchBilibiliChannelSnapshot(mid: string): Promise<ChannelSnapshot> {
  const overallStart = Date.now();
  console.info(`[bilibili/channelSnapshot] start mid=${mid}`);

  const listStart = Date.now();
  const result = await fetchBilibiliChannelViaJustOneApi(mid);
  console.info(
    `[bilibili/channelSnapshot] mid=${mid} justOneApi done in ${Date.now() - listStart}ms: ${result.videos.length} videos, channel="${result.channel.name ?? '(unknown)'}"`
  );

  if (result.videos.length === 0) {
    throw new Error(`Bilibili channel ${mid} returned no videos from JustOneAPI`);
  }

  // Fallback to x/web-interface/view only if JustOneAPI's response
  // lacked channel name or avatar — a single extra call at most.
  let channelName = result.channel.name;
  let channelLogo = result.channel.logoUrl;
  if (channelName == null || channelLogo == null) {
    const viewStart = Date.now();
    const firstVideoMeta = await fetchBilibiliVideoSnapshot(result.videos[0].videoId);
    console.info(
      `[bilibili/channelSnapshot] mid=${mid} view fallback done in ${Date.now() - viewStart}ms`
    );
    channelName = channelName ?? firstVideoMeta.channel.name;
    channelLogo = channelLogo ?? firstVideoMeta.channel.logoUrl;
  }

  const snapshotVideos: SnapshotVideo[] = result.videos.map((v) => ({
    videoId: v.videoId,
    title: v.title,
    description: v.description,
    publishedAt: v.publishedAt,
    link: buildBilibiliVideoUrl(v.videoId),
    thumbnailUrl: v.thumbnailUrl,
    durationSeconds: v.durationSeconds,
  }));

  console.info(
    `[bilibili/channelSnapshot] mid=${mid} done in ${Date.now() - overallStart}ms: name="${channelName ?? '(unknown)'}" videos=${snapshotVideos.length}`
  );
  return {
    channelId: mid,
    name: channelName ?? 'Unknown',
    handle: null,
    logoUrl: channelLogo,
    videos: snapshotVideos,
  };
}
