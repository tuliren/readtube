import { fetchStaleChannels, refreshChannel } from './steps';
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
