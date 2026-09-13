'use client';

import { RefreshCw } from 'lucide-react';

import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { MANUAL_REFRESH_DAYS, canManuallyRefresh } from '@/lib/channels/staleness';
import { isProduction } from '@/lib/vercelEnv';

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
  const allowed =
    source === 'playlists' ||
    !isProduction() ||
    canManuallyRefresh(checkedAt != null ? new Date(checkedAt) : null);
  const { refresh, refreshing } = useRefreshSource(source, id, allowed);

  return (
    <DropdownMenuItem
      disabled={refreshing || !allowed}
      onSelect={() => void refresh()}
      title={
        allowed ? undefined : `Refreshed recently. Try again after ${MANUAL_REFRESH_DAYS} days.`
      }
    >
      <RefreshCw
        className={`mr-2 h-3.5 w-3.5 text-muted-foreground ${refreshing ? 'animate-spin' : ''}`}
      />
      {refreshing ? 'Refreshing…' : 'Refresh'}
    </DropdownMenuItem>
  );
}
