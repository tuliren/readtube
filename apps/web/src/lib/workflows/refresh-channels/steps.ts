import { ChannelStatus, type VideoPlatformType, prisma } from '@readtube/database';
import { FatalError, getWorkflowMetadata } from 'workflow';

import { hasChannelHandleConflict } from '@/lib/channels/handleConflict';
import { STALE_DAYS } from '@/lib/channels/staleness';
import { getPlatformByType } from '@/lib/platforms';
import { isEmptyString } from '@/lib/string';
import { claimChannelRefresh, releaseChannelRefresh } from '@/lib/workflows/runRegistry';

/** Maximum number of channels to refresh per workflow run. */
export const BATCH_SIZE = 10;

/**
 * Small delay between per-channel fetches so we stay polite toward
 * upstream endpoints (YouTube RSS, Bilibili space page + view API) and
 * don't burst a large batch of requests in parallel.
 */
const RATE_LIMIT_DELAY_MS = 250;

/**
 * How long a channel can sit in `REFRESHING` before we treat the
 * marker as stale and revert it. The longest legitimate hold is
 * `maxDuration = 300s` (the workflow's own time budget) plus a
 * generous safety margin for clock skew and slow upstream calls;
 * 30 minutes is well past anything healthy.
 */
const STALE_REFRESHING_MS = 30 * 60 * 1000;

/**
 * How long the cron leaves a channel alone after a failed refresh.
 * A failed attempt doesn't advance `checked_at`, so without this the
 * row would stay at the front of the stale queue and be re-fetched on
 * every 30-minute tick — 48 upstream calls a day for a channel that
 * is broken upstream, and for Bilibili every one of those is a paid
 * JustOneAPI call. Six hours caps a broken channel at 4 attempts a
 * day while a transient blip still self-heals the same day.
 */
export const FAILED_REFRESH_BACKOFF_MS = 6 * 60 * 60 * 1000;

export interface StaleChannel {
  id: string;
  source_id: string;
  source_type: VideoPlatformType;
  name: string;
  logo_url: string | null;
}

export async function fetchStaleChannels(): Promise<StaleChannel[]> {
  'use step';

  const cutoff = new Date(Date.now() - STALE_DAYS * 24 * 60 * 60 * 1000);
  const failedCutoff = new Date(Date.now() - FAILED_REFRESH_BACKOFF_MS);

  // Only refresh channels with at least one active UserSubscription.
  // "Shadow" channel rows created by the individual-video add flow exist
  // so that a standalone video always has a valid Channel FK, but until
  // a user actually subscribes to them we don't need to refresh them.
  // They get picked up lazily on first subscribe.
  //
  // Platform-specific fetching is dispatched via getPlatformByType using
  // source_type.
  //
  // Skip Bilibili channels when JUSTONEAPI_TOKEN is unset — their
  // fetchChannelSnapshot would throw on every cron run, and because
  // refreshChannel only updates checked_at on success, null-checked_at
  // Bilibili rows would otherwise sit at the front of the `ORDER BY
  // checked_at NULLS FIRST` queue forever and starve YouTube refreshes.
  const excludedPlatforms: VideoPlatformType[] = [];
  if (process.env.JUSTONEAPI_TOKEN == null || process.env.JUSTONEAPI_TOKEN.length === 0) {
    excludedPlatforms.push('BILIBILI' as VideoPlatformType);
  }

  const rows = await prisma.channel.findMany({
    where: {
      AND: [
        { OR: [{ checked_at: null }, { checked_at: { lt: cutoff } }] },
        // Leave recently-failed rows alone — see FAILED_REFRESH_BACKOFF_MS.
        { OR: [{ refresh_failed_at: null }, { refresh_failed_at: { lt: failedCutoff } }] },
      ],
      subscriptions: { some: {} },
      // Skip channels currently being refreshed by another workflow
      // (manual single-channel refresh, or a previous cron run that
      // hasn't released the row yet). The per-row claim inside
      // `refreshChannel` is the safety net; this filter is the
      // optimization so the cron doesn't waste a slot on a row it
      // would just skip later.
      status: ChannelStatus.READY,
      ...(excludedPlatforms.length > 0 ? { source_type: { notIn: excludedPlatforms } } : {}),
    },
    orderBy: { checked_at: { sort: 'asc', nulls: 'first' } },
    take: BATCH_SIZE,
    select: { id: true, source_id: true, source_type: true, name: true, logo_url: true },
  });
  return rows;
}

/**
 * Recover channels stuck in `REFRESHING` whose workflow died without
 * releasing the row (e.g. container kill, OOM). Cheap heuristic:
 * `updated_at` is bumped on every status flip via `@updatedAt`, so a
 * row whose `updated_at` is older than `STALE_REFRESHING_MS` is
 * almost certainly orphaned. Reverts to `READY` so subsequent
 * `fetchStaleChannels` calls (in this same cron tick) can pick it up.
 *
 * Without this, an orphaned REFRESHING row would be permanently
 * invisible to the cron — the manual route's stale-marker recovery
 * (`findActiveChannelRefresh`) only fires when a user clicks Refresh
 * on that specific channel, which may never happen.
 */
export async function recoverStaleRefreshingChannels(): Promise<number> {
  'use step';

  const cutoff = new Date(Date.now() - STALE_REFRESHING_MS);
  const result = await prisma.channel.updateMany({
    where: { status: ChannelStatus.REFRESHING, updated_at: { lt: cutoff } },
    data: { status: ChannelStatus.READY },
  });
  if (result.count > 0) {
    console.info(`[refresh-channels] Recovered ${result.count} stale REFRESHING channel(s)`);
  }
  return result.count;
}

export async function fetchChannelById(channelId: string): Promise<StaleChannel | null> {
  'use step';

  const row = await prisma.channel.findUnique({
    where: { id: channelId },
    select: { id: true, source_id: true, source_type: true, name: true, logo_url: true },
  });
  return row;
}

export interface RefreshResult {
  channelId: string;
  videosProcessed: number;
  nameUpdated: boolean;
}

/**
 * Refresh one channel: re-fetch its upstream snapshot, upsert the
 * snapshot's videos, and update its metadata + checked_at.
 *
 * Refresh-dedup integration:
 *   - When called from `refreshChannelsWorkflow` (cron) with
 *     `claimRow: true`, the step atomically claims the row using
 *     its own runId from `getWorkflowMetadata()`. If the claim fails
 *     (another path owns the row), the step returns null so the
 *     caller can skip it.
 *   - When called from `refreshSingleChannelWorkflow` (manual) with
 *     `claimRow: false`, the route has already done the claim with
 *     its own runId. The step skips the claim/release entirely so it
 *     doesn't fight the route over the lifecycle.
 *
 * Failure handling: any error — upstream fetch or DB — stamps
 * `Channel.refresh_failed_at` and surfaces as a `FatalError`, so the
 * workflow runtime does NOT retry the step. In-run retries bought
 * nothing here (the next cron tick is the retry) and each one re-ran
 * the paid Bilibili list call only to fail again on the same
 * downstream error. The cron then backs the row off for
 * `FAILED_REFRESH_BACKOFF_MS`; the manual route still returns its
 * usual 500 to the user.
 */
export async function refreshChannel(
  channel: StaleChannel,
  options: { claimRow: boolean }
): Promise<RefreshResult | null> {
  'use step';

  if (options.claimRow) {
    const runId = getWorkflowMetadata().workflowRunId;
    const claimed = await claimChannelRefresh(prisma, channel.id, runId);
    if (!claimed) {
      console.info(
        `[refresh-channels] Skipping ${channel.id} — already being refreshed by another path`
      );
      return null;
    }
    try {
      return await runRefreshChannel(channel);
    } finally {
      await releaseChannelRefresh(prisma, channel.id, runId);
    }
  }

  return runRefreshChannel(channel);
}

async function runRefreshChannel(channel: StaleChannel): Promise<RefreshResult> {
  try {
    return await fetchAndPersistSnapshot(channel);
  } catch (err) {
    // Log the original error here, with its stack — the FatalError
    // that reaches the workflow only carries the message.
    console.error(`[refresh-channels] Refresh failed for channel ${channel.id}:`, err);
    await markRefreshFailed(channel.id);
    const message = err instanceof Error ? err.message : String(err);
    throw new FatalError(`Refresh failed for channel ${channel.id}: ${message}`);
  }
}

async function markRefreshFailed(channelId: string): Promise<void> {
  try {
    await prisma.channel.update({
      where: { id: channelId },
      data: { refresh_failed_at: new Date() },
    });
  } catch (err) {
    // Bookkeeping must never mask the real failure.
    console.error(`[refresh-channels] Could not record refresh failure for ${channelId}:`, err);
  }
}

async function fetchAndPersistSnapshot(channel: StaleChannel): Promise<RefreshResult> {
  await new Promise((r) => setTimeout(r, RATE_LIMIT_DELAY_MS));

  const platform = getPlatformByType(channel.source_type);
  // Hand over what the row already holds so a platform whose list
  // source omits a field (Bilibili: avatar) can skip its secondary
  // fetch instead of repeating it on every refresh.
  const snapshot = await platform.fetchChannelSnapshot(channel.source_id, {
    knownName: channel.name,
    knownLogoUrl: channel.logo_url,
  });

  const nameUpdated = snapshot.name !== channel.name;

  for (const video of snapshot.videos) {
    // Use `video_unique_source` (source_type + source_id, globally
    // unique) instead of `video_unique_channel_source`. This avoids a
    // P2002 crash when a video was previously created under a
    // different channel (e.g. the playlist-owner's channel from the
    // add-playlist flow) — the cron now matches the existing row and
    // corrects the channel_id to the actual owner.
    await prisma.video.upsert({
      where: {
        video_unique_source: {
          source_type: channel.source_type,
          source_id: video.videoId,
        },
      },
      create: {
        channel_id: channel.id,
        // source_type must match the `where` clause so Prisma uses a
        // native Postgres upsert (CLAUDE.md).
        source_type: channel.source_type,
        source_id: video.videoId,
        title: video.title,
        description: video.description,
        published_at: video.publishedAt,
        thumbnail_url: video.thumbnailUrl,
        duration_seconds: video.durationSeconds,
      },
      // `isScraped` videos preserve title/description/publishedAt
      // (truncated scrape data would regress richer RSS data) but
      // still re-point `channel_id` to migrate a video out from under
      // a shadow channel — see SnapshotVideo.
      update:
        video.isScraped === true
          ? { channel_id: channel.id }
          : {
              // Correct channel_id if the video was previously assigned to
              // a different channel (e.g. playlist-owner shadow channel).
              channel_id: channel.id,
              title: video.title,
              ...(isEmptyString(video.description) ? {} : { description: video.description }),
              // Backfill published_at whenever this refresh produced a real
              // date — rows that were created with a null placeholder from
              // a thin scrape path get the real RSS timestamp here.
              ...(video.publishedAt != null ? { published_at: video.publishedAt } : {}),
              thumbnail_url: video.thumbnailUrl,
              ...(video.durationSeconds != null ? { duration_seconds: video.durationSeconds } : {}),
            },
    });
  }

  // Skip the handle update when another channel row already owns it
  // (stale scrape or a rename upstream) — otherwise the update would
  // trip `@@unique([source_type, handle])` and crash the cron.
  const handleConflict = await hasChannelHandleConflict(
    prisma,
    snapshot.handle,
    channel.id,
    channel.source_type
  );
  await prisma.channel.update({
    where: { id: channel.id },
    data: {
      ...(nameUpdated ? { name: snapshot.name } : {}),
      ...(!isEmptyString(snapshot.logoUrl) ? { logo_url: snapshot.logoUrl } : {}),
      ...(!isEmptyString(snapshot.handle) && !handleConflict ? { handle: snapshot.handle } : {}),
      checked_at: new Date(),
      refresh_failed_at: null,
    },
  });

  return {
    channelId: channel.id,
    videosProcessed: snapshot.videos.length,
    nameUpdated,
  };
}
