'use client';

import { RefreshCw } from 'lucide-react';

import { useRefreshSource } from './useRefreshSource';

export default function RefreshPlaylistButton({
  playlistId,
  compact = false,
}: {
  playlistId: string;
  compact?: boolean;
}) {
  const { refresh, refreshing } = useRefreshSource('playlists', playlistId);

  return (
    <button
      type="button"
      onClick={refresh}
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
