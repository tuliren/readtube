'use client';

import { RefreshCw } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { useSWRConfig } from 'swr';

export default function RefreshPlaylistButton({
  playlistId,
  compact = false,
}: {
  playlistId: string;
  compact?: boolean;
}) {
  const { mutate } = useSWRConfig();
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);

  async function handleRefresh() {
    if (refreshing) {
      return;
    }
    setRefreshing(true);
    try {
      const res = await fetch(`/api/playlists/${playlistId}/refresh`, { method: 'POST' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? 'Failed to refresh playlist');
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
      toast.error(err instanceof Error ? err.message : 'Failed to refresh playlist');
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleRefresh}
      disabled={refreshing}
      aria-label="Refresh playlist"
      title="Pull latest videos and metadata for this playlist"
      className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50 disabled:hover:bg-transparent"
    >
      <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
      {!compact && <span>{refreshing ? 'Refreshing…' : 'Refresh'}</span>}
    </button>
  );
}
