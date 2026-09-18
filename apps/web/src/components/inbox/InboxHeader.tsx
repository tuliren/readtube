'use client';

import { RefreshCw } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { useSWRConfig } from 'swr';

import ExternalLinkActions from '@/components/ExternalLinkActions';
import { iconActionClassName } from '@/components/iconActionStyles';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import type { ChannelConsumption } from '@/lib/channels/consumption';
import { MANUAL_REFRESH_DAYS, canManuallyRefresh } from '@/lib/channels/staleness';
import type { VideoData, VideoPlatform } from '@/lib/types';
import { buildChannelLink } from '@/lib/urls/watchUrl';
import { isDevelopment } from '@/lib/vercelEnv';

import ChannelAvatar from './ChannelAvatar';
import ConsumptionMeter from './ConsumptionMeter';
import HeaderReadActions from './HeaderReadActions';
import Pagination from './Pagination';
import SearchInput from './SearchInput';

export interface InboxHeaderProps {
  channelId: string | null;
  /** Platform source id — YouTube UC-prefixed id, or Bilibili numeric
   *  mid. Null for aggregate views (Inbox / Starred / etc). */
  channelSourceId: string | null;
  /** Owning platform — drives the external "Open channel on X" link
   *  host. Null for aggregate views. */
  channelPlatform: VideoPlatform | null;
  channelName: string;
  /** Channel logo URL. Only available when viewing a single channel
   *  that has a logo persisted from the scraper. Null for the
   *  Inbox/Starred/etc. aggregate views. */
  channelLogoUrl: string | null;
  /** Last successful snapshot time for the active channel — drives
   *  the manual refresh button's enabled state. ISO string, or null
   *  for shadow channels that have never been refreshed. Ignored
   *  when channelId is null. */
  channelCheckedAt: string | null;
  /** Consumption counts for the active channel, rendered as the ring
   *  between the title and the unread badge. Null for the aggregate
   *  and library views, which have no single channel to rate. */
  consumption: ChannelConsumption | null;
  unreadCount: number;
  /** Total videos that match the current filter (across all pages).
   *  Drives the Page X of Y control on the right side of the header. */
  totalVideos: number;
  /** The currently displayed page, including its effective read state. */
  videos: VideoData[];
  /** Optional trailing content after the title (e.g. ExternalLinkActions). */
  trailing?: React.ReactNode;
  /** Override the body sent to POST /api/videos/mark-all-read.
   *  Defaults to `{ channelId }` or `{}` for the inbox. Library views
   *  pass `{ standaloneOnly: true }` or `{ playlistId }`. */
  markAllReadBody?: Record<string, unknown>;
  /** Hide the search input in the bottom row. Library views paginate
   *  but don't (yet) support free-text search, so the box is hidden
   *  there while Prev / X–Y of N / Next still renders. */
  hideSearch?: boolean;
}

export default function InboxHeader({
  channelId,
  channelSourceId,
  channelPlatform,
  channelName,
  channelLogoUrl,
  channelCheckedAt,
  consumption,
  unreadCount,
  totalVideos,
  videos,
  trailing,
  markAllReadBody,
  hideSearch,
}: InboxHeaderProps) {
  const { mutate } = useSWRConfig();
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);
  const showRefresh = channelId != null;
  const checkedAtDate = channelCheckedAt != null ? new Date(channelCheckedAt) : null;
  // Only local development bypasses the cooldown.
  const refreshAllowed = isDevelopment() || canManuallyRefresh(checkedAtDate);
  const refreshDisabled = refreshing || !refreshAllowed;
  const refreshTooltip = refreshAllowed
    ? 'Pull latest videos + metadata for this channel'
    : `Refreshed recently. Try again after ${MANUAL_REFRESH_DAYS} day${MANUAL_REFRESH_DAYS === 1 ? '' : 's'} since the last refresh.`;

  async function handleRefreshChannel() {
    if (channelId == null || refreshing || !refreshAllowed) {
      return;
    }
    setRefreshing(true);
    try {
      const res = await fetch(`/api/channels/${channelId}/refresh`, { method: 'POST' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: 'Refresh failed' }));
        toast.error(body.error ?? 'Refresh failed');
        return;
      }
      const body = (await res.json()) as { videosProcessed: number };
      toast.success(`Refreshed: ${body.videosProcessed} videos processed`);
      // Two-pronged invalidation:
      //   1. router.refresh() re-runs the SSR page so the next mount
      //      picks up the new fallbackData.
      //   2. SWR's mutate() drops the existing cache entries so any
      //      currently-mounted hook re-fetches instead of serving stale
      //      data — fallbackData alone is ignored once an entry exists.
      await Promise.all([
        mutate('/api/channels'),
        mutate((key) => typeof key === 'string' && key.startsWith('/api/videos')),
      ]);
      router.refresh();
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <div className="flex h-auto shrink-0 flex-col border-b border-border bg-background">
      {/* Title row — action buttons sit next to the title/badge,
          search stays on the right edge. This keeps the actions
          contextually close to the thing they act on. */}
      <div className="hidden h-12 items-center justify-start gap-2 overflow-hidden px-4 sidebar:flex">
        <div className="flex min-w-0 items-center gap-2">
          {channelLogoUrl != null && (
            <div className="hidden sidebar:block">
              <ChannelAvatar url={channelLogoUrl} size={40} cssSize="h-6 w-6" />
            </div>
          )}
          <h1 className="hidden min-w-0 truncate text-sm font-semibold text-foreground sidebar:block">
            {channelName}
          </h1>
          {consumption != null && <ConsumptionMeter consumption={consumption} />}
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <span
                  tabIndex={0}
                  aria-label={`Unread video(s): ${unreadCount}`}
                  className="shrink-0 rounded-full bg-blue-100 px-1.5 py-0.5 text-xs font-medium text-blue-700"
                >
                  {unreadCount}
                </span>
              </TooltipTrigger>
              <TooltipContent side="bottom">Unread video(s): {unreadCount}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <div className="flex shrink-0 items-center gap-1">
            {channelSourceId != null && channelPlatform != null && (
              <ExternalLinkActions
                url={buildChannelLink(channelPlatform, channelSourceId).url}
                label={`Open channel on ${buildChannelLink(channelPlatform, channelSourceId).platformName}`}
              />
            )}
            {trailing}
            {showRefresh && (
              <TooltipProvider delayDuration={200}>
                <Tooltip>
                  {/* The disabled state strips pointer events from the
                    button, which would also strip the Radix tooltip's
                    hover detection. Wrap in a span so the trigger still
                    receives mouseenter while the inner button stays
                    semantically disabled. */}
                  <TooltipTrigger asChild>
                    <span className="hidden sidebar:inline-flex">
                      <button
                        type="button"
                        onClick={handleRefreshChannel}
                        disabled={refreshDisabled}
                        aria-label="Refresh channel"
                        aria-busy={refreshing}
                        className={iconActionClassName}
                      >
                        <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
                      </button>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">{refreshTooltip}</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
            <HeaderReadActions
              videos={videos}
              unreadCount={unreadCount}
              body={markAllReadBody ?? (channelId != null ? { channelId } : {})}
              scopeName={channelName}
            />
          </div>
        </div>
      </div>
      {/* Video count + pagination on the left, search on the right.
          The header itself sits above the scrolling video list and
          never scrolls away, so the pagination control is always
          reachable while the user is reading rows. Library views
          render pagination but hide the search box. */}
      <div className="flex items-center justify-between gap-2 px-4 py-2 sidebar:pt-0">
        <Pagination total={totalVideos} />
        {!hideSearch && <SearchInput />}
      </div>
    </div>
  );
}
