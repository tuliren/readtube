import type { ChannelData, FolderData } from '@/lib/types';

export interface PartitionedChannels {
  rootChannels: ChannelData[];
  byFolder: Map<string, ChannelData[]>;
}

/**
 * Split subscribed channels into root-level channels and per-folder
 * lists, preserving input order within each group.
 *
 * A channel whose folder id is unknown is treated as root so it stays
 * visible in two cases:
 *   1. Initial render: channels come from SSR fallback data, but
 *      `folders` is [] until the client-side /api/folders fetch
 *      completes. Without this, foldered channels would flash out of
 *      view for the first 100ms.
 *   2. Stale state: a folder was deleted in another tab; its channels
 *      still carry the old folder id until the next /api/channels
 *      revalidation. Showing them at root beats hiding them.
 */
export function partitionChannelsByFolder(
  channels: ChannelData[],
  folders: FolderData[]
): PartitionedChannels {
  const folderIds = new Set(folders.map((f) => f.id));
  const rootChannels: ChannelData[] = [];
  const byFolder = new Map<string, ChannelData[]>();
  for (const channel of channels) {
    if (channel.folderId == null || !folderIds.has(channel.folderId)) {
      rootChannels.push(channel);
      continue;
    }
    const existing = byFolder.get(channel.folderId) ?? [];
    existing.push(channel);
    byFolder.set(channel.folderId, existing);
  }
  return { rootChannels, byFolder };
}
