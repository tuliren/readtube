'use client';

import { RefreshCw } from 'lucide-react';

import { DropdownMenuItem } from '@/components/ui/dropdown-menu';

import { type RefreshSource, useRefreshSource } from './useRefreshSource';

export default function RefreshSourceMenuItem({
  source,
  id,
  checkedAt,
}: {
  source: RefreshSource;
  id: string;
  checkedAt?: string | null;
}) {
  const { refresh, refreshing, allowed } = useRefreshSource(source, id, checkedAt);

  return (
    <DropdownMenuItem
      disabled={refreshing || !allowed}
      onSelect={() => void refresh()}
      title={
        allowed
          ? undefined
          : `${source === 'playlists' ? 'Checked' : 'Refreshed'} recently. Try again after 24 hours.`
      }
    >
      <RefreshCw
        className={`mr-2 h-3.5 w-3.5 text-muted-foreground ${refreshing ? 'animate-spin' : ''}`}
      />
      {refreshing ? 'Refreshing…' : 'Refresh'}
    </DropdownMenuItem>
  );
}
