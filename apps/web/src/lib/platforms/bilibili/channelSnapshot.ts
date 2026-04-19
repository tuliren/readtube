import type { ChannelSnapshot, SnapshotVideo } from '@/lib/platforms/types';

import { fetchBilibiliChannelViaJustOneApi } from './justOneApi';
import { buildBilibiliVideoUrl } from './urls';
import { fetchBilibiliVideoSnapshot } from './videoSnapshot';

/**
 * Fetch channel meta + recent videos for a Bilibili uploader via
 * JustOneAPI (third-party wrapper at justoneapi.com). We delegate the
 * IP-reputation / WBI-risk-control problem to them — they collect
 * the data on their own residential infra and expose a simple
 * token-auth HTTP API.
 *
 * If JustOneAPI's response is missing channel name/avatar (depends on
 * whether their envelope carries owner info top-level), we fall back
 * to one `x/web-interface/view` call on the newest BV id to fetch
 * those fields — the same trick we used with the WBI path.
 *
 * NOTE: two earlier paths live in the tree as dormant fallbacks:
 *   - `channelScrape.ts` + `lib/puppeteer/` — headless-Chromium scrape
 *     of `space.bilibili.com/<mid>/upload/video`.
 *   - `channelVideos.ts` + `wbi.ts` — direct signed call to
 *     `api.bilibili.com/x/space/wbi/arc/search`.
 * Both got rate-limited or risk-controlled in real-world use, which
 * is why we're on JustOneAPI now. They're kept for quick rollback.
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
