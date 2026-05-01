import { VideoPlatformType, prisma } from '@readtube/database';

import { upsertChannelWithVideos } from '@/lib/channels/upsertChannelWithVideos';
import { detectChannelSource, getPlatformByType } from '@/lib/platforms';
import { fetchChannelSnapshot as fetchYouTubeChannelSnapshot } from '@/lib/platforms/youtube/channelSnapshot';
import { extractHandle } from '@/lib/platforms/youtube/urls';
import { isEmptyString } from '@/lib/string';

export interface AddChannelResult {
  channelId: string;
  sourceId: string;
  sourceType: VideoPlatformType;
}

/**
 * Tagged-message prefixes the route uses to map workflow failures
 * back to specific HTTP error responses. The error itself is a plain
 * `Error` (not `FatalError`) so it survives Jest unit-test contexts
 * where the workflow runtime isn't loaded — the route only inspects
 * the message string anyway.
 */
export const INVALID_URL_PREFIX = 'INVALID_URL:';
export const FETCH_FAILED_PREFIX = 'FETCH_FAILED:';

/**
 * Fetch a channel's full snapshot (metadata + videos) and upsert it
 * with all of its videos. Idempotent: rerunning against an existing
 * row updates metadata and merges the snapshot's videos via
 * `video_unique_source` upserts.
 *
 * Throws `FatalError` (non-retryable) for two recoverable failure
 * modes; the route maps them back to HTTP status codes by matching
 * the message prefix:
 *   - INVALID_URL_PREFIX  → input is not a recognizable channel URL
 *                           or @handle. Maps to 400.
 *   - FETCH_FAILED_PREFIX → upstream fetch (scrape, RSS, JustOneAPI)
 *                           failed. Maps to 400 (same as today's
 *                           inline `resolveChannel` catch).
 */
export async function fetchAndPersistChannelStep(input: string): Promise<AddChannelResult> {
  'use step';

  const trimmed = input?.trim() ?? '';
  if (isEmptyString(trimmed)) {
    throw new Error(`${INVALID_URL_PREFIX} empty input`);
  }

  // First try the sync-parse path (YouTube /channel/UC, bare UC,
  // Bilibili space URL, bare numeric mid). detectChannelSource returns
  // null for YouTube @handle URLs — those need a scrape to resolve.
  const directSource = detectChannelSource(trimmed);
  if (directSource != null) {
    let snapshot;
    try {
      snapshot = await directSource.platform.fetchChannelSnapshot(directSource.sourceId);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`${FETCH_FAILED_PREFIX} ${message}`);
    }
    const channel = await upsertChannelWithVideos(
      prisma,
      directSource.platform,
      directSource.sourceId,
      snapshot
    );
    return {
      channelId: channel.id,
      sourceId: directSource.sourceId,
      sourceType: directSource.platform.type,
    };
  }

  // YouTube @handle path — scrape the channel page first to resolve
  // the UC id, then fetch the snapshot using the handle URL (the
  // YouTube fetcher does both scrape + RSS internally).
  const handle = extractHandle(trimmed);
  if (handle == null) {
    throw new Error(`${INVALID_URL_PREFIX} not a recognizable channel URL`);
  }

  const platform = getPlatformByType(VideoPlatformType.YOUTUBE);
  let snapshot;
  try {
    snapshot = await fetchYouTubeChannelSnapshot({
      channelPageUrl: `https://www.youtube.com/@${handle}`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`${FETCH_FAILED_PREFIX} ${message}`);
  }
  const channel = await upsertChannelWithVideos(prisma, platform, snapshot.channelId, snapshot);
  return {
    channelId: channel.id,
    sourceId: snapshot.channelId,
    sourceType: platform.type,
  };
}
