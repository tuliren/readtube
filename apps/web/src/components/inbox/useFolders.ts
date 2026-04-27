'use client';

import { toast } from 'sonner';

import { useSidebarData } from '@/components/dashboard/SidebarDataContext';
import type { FolderData } from '@/lib/types';

/**
 * Folder data + mutation helpers. Folders themselves come from the
 * shared `SidebarDataContext` — that way every sidebar row reads from
 * one SWR subscription seeded by SSR fallback data, and consumers
 * (FolderSection, the auto-uncollapse hook, etc.) get a synchronous
 * initial value instead of a beat of empty state. The mutation
 * helpers continue to invalidate /api/folders + /api/channels here
 * via the context's revalidation hooks.
 */
export function useFolders() {
  const { folders, mutateFolders, invalidateFoldersAndChannels } = useSidebarData();

  return {
    folders,

    async create(name: string): Promise<FolderData | null> {
      try {
        const res = await fetch('/api/folders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          throw new Error(body?.error ?? `Failed (${res.status})`);
        }
        const folder = (await res.json()) as FolderData;
        void mutateFolders();
        toast.success(`Folder "${folder.name}" created`);
        return folder;
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to create folder');
        return null;
      }
    },

    async rename(id: string, name: string): Promise<void> {
      try {
        const res = await fetch(`/api/folders/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name }),
        });
        if (!res.ok) {
          throw new Error(`Failed (${res.status})`);
        }
        void mutateFolders();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to rename folder');
      }
    },

    /**
     * Returns true on success, false on failure. The boolean lets
     * DeleteFolderDialog keep the modal open + busy=false on failure
     * so the user can retry, instead of always closing on completion.
     * Mirrors the create() pattern (which returns the new folder on
     * success or null on failure).
     */
    async remove(id: string): Promise<boolean> {
      try {
        const res = await fetch(`/api/folders/${id}`, { method: 'DELETE' });
        if (!res.ok) {
          throw new Error(`Failed (${res.status})`);
        }
        invalidateFoldersAndChannels();
        toast.success('Folder deleted');
        return true;
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to delete folder');
        return false;
      }
    },

    async moveChannel(channelId: string, folderId: string | null): Promise<void> {
      try {
        const res = await fetch(`/api/subscriptions/${channelId}/folder`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ folderId }),
        });
        if (!res.ok) {
          throw new Error(`Failed (${res.status})`);
        }
        invalidateFoldersAndChannels();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to move channel');
      }
    },
  };
}
