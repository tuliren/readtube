import { fetchChannelById, fetchStaleChannels, refreshChannel } from './steps';
import type { RefreshResult } from './steps';

export const maxDuration = 300;

export interface WorkflowResult {
  results: RefreshResult[];
  errors: number;
}

export async function refreshChannelsWorkflow(): Promise<WorkflowResult> {
  'use workflow';

  const channels = await fetchStaleChannels();

  const results: RefreshResult[] = [];
  let errors = 0;

  for (const channel of channels) {
    try {
      const result = await refreshChannel(channel);
      results.push(result);
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
 */
export async function refreshSingleChannelWorkflow(
  channelId: string
): Promise<RefreshResult | null> {
  'use workflow';

  const channel = await fetchChannelById(channelId);
  if (channel == null) {
    return null;
  }
  return refreshChannel(channel);
}
