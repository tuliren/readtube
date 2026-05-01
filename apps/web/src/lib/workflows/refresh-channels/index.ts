import {
  fetchChannelById,
  fetchStaleChannels,
  recoverStaleRefreshingChannels,
  refreshChannel,
} from './steps';
import type { RefreshResult } from './steps';

export const maxDuration = 300;

export interface WorkflowResult {
  results: RefreshResult[];
  errors: number;
}

/**
 * Cron-driven batch refresh. Each per-channel `refreshChannel` step
 * atomically claims its row (READY → REFRESHING + workflow_id =
 * <this run>) using `getWorkflowMetadata().workflowRunId` to identify
 * itself. If the claim fails, the channel is currently being
 * refreshed by another path and we skip it.
 */
export async function refreshChannelsWorkflow(): Promise<WorkflowResult> {
  'use workflow';

  // Recover orphaned REFRESHING rows first so they re-enter the
  // candidate pool for this same cron tick. Without this, a row
  // whose previous workflow was killed mid-run would be permanently
  // invisible to the cron (`fetchStaleChannels` filters status=READY)
  // until a user manually refreshes it.
  await recoverStaleRefreshingChannels();

  const channels = await fetchStaleChannels();

  const results: RefreshResult[] = [];
  let errors = 0;

  for (const channel of channels) {
    try {
      const result = await refreshChannel(channel, { claimRow: true });
      if (result != null) {
        results.push(result);
      }
    } catch (err) {
      errors++;
      console.error(`[refresh-channels] Failed to refresh channel ${channel.id}:`, err);
    }
  }

  return { results, errors };
}

/**
 * Refreshes a single channel by id. Used by the manual Refresh button
 * in the inbox sidebar so it applies the exact same updates the cron
 * workflow does (metadata, handle, checked_at, video upserts).
 *
 * Status flips for this path are owned by the manual refresh route
 * (it captures the runId and atomically claims/releases via
 * `claimChannelRefresh` / `releaseChannelRefresh`). Pass
 * `claimRow: false` so the step doesn't re-claim a row the route
 * already owns.
 */
export async function refreshSingleChannelWorkflow(
  channelId: string
): Promise<RefreshResult | null> {
  'use workflow';

  const channel = await fetchChannelById(channelId);
  if (channel == null) {
    return null;
  }
  return refreshChannel(channel, { claimRow: false });
}
