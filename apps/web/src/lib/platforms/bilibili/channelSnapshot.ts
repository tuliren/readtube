import type { ChannelSnapshotHints } from '@/lib/platforms/base';
import type { ChannelSnapshot, SnapshotVideo } from '@/lib/platforms/types';
import { isEmptyString } from '@/lib/string';

import { fetchBilibiliChannelViaJustOneApi } from './justOneApi';
import { buildBilibiliVideoUrl } from './urls';
import { fetchBilibiliVideoSnapshot } from './videoSnapshot';

/**
 * Fetch channel meta + recent videos for a Bilibili uploader via
 * JustOneAPI (third-party wrapper at justoneapi.com). We delegate the
 * IP-reputation / risk-control problem to them — they collect the
 * data on their own infra and expose a simple token-auth HTTP API.
 *
 * JustOneAPI's envelope never carries the uploader's avatar (and has
 * no name when the list is empty), so whatever is still missing after
 * applying the caller's `hints` is backfilled with one
 * `x/web-interface/view` call on the newest bvid. That call goes to
 * Bilibili directly from our own egress and is subject to their risk
 * control (HTTP 412 for datacenter IPs), so it is best-effort: on
 * failure we log and leave the field null instead of failing the
 * snapshot — the paid JustOneAPI call has already succeeded by then,
 * and the refresh step never overwrites `logo_url` with an empty
 * value anyway.
 *
 * On a refresh the caller passes the row's current name/logo as
 * hints, so a channel that already has an avatar makes no view call
 * at all. The trade-off is that a stored Bilibili avatar is never
 * re-fetched.
 */
export async function fetchBilibiliChannelSnapshot(
  mid: string,
  hints: ChannelSnapshotHints = {}
): Promise<ChannelSnapshot> {
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

  // JustOneAPI's name is the freshest source, so it wins over the
  // hint; the avatar only ever comes from the hint or the fallback.
  let channelName = firstNonEmpty(result.channel.name, hints.knownName);
  let channelLogo = firstNonEmpty(result.channel.logoUrl, hints.knownLogoUrl);
  if (channelName == null || channelLogo == null) {
    const viewStart = Date.now();
    try {
      const firstVideoMeta = await fetchBilibiliVideoSnapshot(result.videos[0].videoId);
      channelName = channelName ?? firstNonEmpty(firstVideoMeta.channel.name);
      channelLogo = channelLogo ?? firstNonEmpty(firstVideoMeta.channel.logoUrl);
      console.info(
        `[bilibili/channelSnapshot] mid=${mid} view fallback done in ${Date.now() - viewStart}ms`
      );
    } catch (err) {
      console.warn(
        `[bilibili/channelSnapshot] mid=${mid} view fallback failed after ${Date.now() - viewStart}ms; continuing without it: ${err instanceof Error ? err.message : String(err)}`
      );
    }
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

/** The first argument that is a non-empty string, else null. */
function firstNonEmpty(...values: Array<string | null | undefined>): string | null {
  for (const value of values) {
    if (!isEmptyString(value)) {
      return value;
    }
  }
  return null;
}
