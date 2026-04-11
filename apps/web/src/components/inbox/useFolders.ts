'use client';

import { toast } from 'sonner';
import useSWR, { useSWRConfig } from 'swr';

import type { FolderData } from '@/lib/types';

const fetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) {
      throw new Error(`Request failed (${r.status})`);
    }
    return r.json() as Promise<FolderData[]>;
  });

/**
 * SWR hook for the current user's folders plus mutation helpers.
 * Every mutation invalidates BOTH /api/folders and /api/channels so the
 * sidebar re-renders with fresh folder contents and channel unread counts.
 */
export function useFolders() {
  const { data: folders = [], mutate } = useSWR<FolderData[]>('/api/folders', fetcher);
  const { mutate: mutateGlobal } = useSWRConfig();

  function invalidateChannels() {
    void mutateGlobal('/api/channels', undefined, { revalidate: true });
  }

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
        void mutate();
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
        void mutate();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to rename folder');
      }
    },

    async remove(id: string): Promise<void> {
      try {
        const res = await fetch(`/api/folders/${id}`, { method: 'DELETE' });
        if (!res.ok) {
          throw new Error(`Failed (${res.status})`);
        }
        void mutate();
        invalidateChannels();
        toast.success('Folder deleted');
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to delete folder');
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
        invalidateChannels();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to move channel');
      }
    },
  };
}
