'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { useSWRConfig } from 'swr';

export type RefreshSource = 'channels' | 'playlists';

/** Shared request and cache refresh for header and dropdown refresh controls. */
export function useRefreshSource(source: RefreshSource, id: string, allowed = true) {
  const { mutate } = useSWRConfig();
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);
  const errorMessage =
    source === 'channels' ? 'Failed to refresh channel' : 'Failed to refresh playlist';

  async function refresh() {
    if (refreshing || !allowed) {
      return;
    }
    setRefreshing(true);
    try {
      const res = await fetch(`/api/${source}/${id}/refresh`, { method: 'POST' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? errorMessage);
      }
      const body = (await res.json()) as { videosProcessed: number };
      toast.success(`Refreshed: ${body.videosProcessed} videos processed`);
      await mutate(
        (key) =>
          typeof key === 'string' &&
          (key === '/api/channels' || key === '/api/playlists' || key.startsWith('/api/videos'))
      );
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : errorMessage);
    } finally {
      setRefreshing(false);
    }
  }

  return { refresh, refreshing };
}
