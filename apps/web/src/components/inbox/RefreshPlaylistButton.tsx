'use client';

import { RefreshCw } from 'lucide-react';

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

import { useRefreshSource } from './useRefreshSource';

export default function RefreshPlaylistButton({
  playlistId,
  checkedAt,
}: {
  playlistId: string;
  checkedAt?: string | null;
}) {
  const { refresh, refreshing, allowed } = useRefreshSource('playlists', playlistId, checkedAt);

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex">
            <button
              type="button"
              onClick={refresh}
              disabled={refreshing || !allowed}
              aria-label="Refresh playlist"
              aria-busy={refreshing}
              className="inline-flex shrink-0 items-center rounded-md px-2 py-1 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50 disabled:hover:bg-transparent"
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            </button>
          </span>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          {refreshing
            ? 'Refreshing…'
            : allowed
              ? 'Refresh playlist'
              : 'Checked recently. Try again after 24 hours.'}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
