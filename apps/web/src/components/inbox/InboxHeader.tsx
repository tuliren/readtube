'use client';

import { CheckIcon } from '@heroicons/react/24/outline';
import { RefreshCw } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { useSWRConfig } from 'swr';

import ExternalLinkActions from '@/components/ExternalLinkActions';
import { MANUAL_REFRESH_DAYS, canManuallyRefresh } from '@/lib/channels/staleness';
import type { VideoPlatform } from '@/lib/types';
import { buildChannelLink } from '@/lib/urls/watchUrl';

import ChannelAvatar from './ChannelAvatar';
import Pagination from './Pagination';
import SearchInput from './SearchInput';

interface Props {
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
  unreadCount: number;
  /** Total videos that match the current filter (across all pages).
   *  Drives the Page X of Y control on the right side of the header. */
  totalVideos: number;
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
  unreadCount,
  totalVideos,
  trailing,
  markAllReadBody,
  hideSearch,
}: Props) {
  const { mutate } = useSWRConfig();
  const router = useRouter();
  const pathname = usePathname();
  const [marking, setMarking] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const showRefresh = channelId != null;
  const checkedAtDate = channelCheckedAt != null ? new Date(channelCheckedAt) : null;
  const refreshAllowed = canManuallyRefresh(checkedAtDate);
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

  async function handleMarkAllRead() {
    setMarking(true);
    try {
      const res = await fetch('/api/videos/mark-all-read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(markAllReadBody ?? (channelId != null ? { channelId } : {})),
      });
      if (!res.ok) {
        return;
      }
      // Refresh the sidebar unread badges and any /api/videos* keys.
      await Promise.all([
        mutate('/api/channels'),
        mutate('/api/playlists'),
        mutate((key) => typeof key === 'string' && key.startsWith('/api/videos')),
      ]);
      // Library pages render via SSR for the first paint and a SWR
      // fallback after that, but the server-rendered payload carries
      // readAt snapshotted at request time. Kick an RSC refresh so
      // subsequent paints (e.g. after fallback expires) match.
      if (
        pathname === '/videos/standalone' ||
        pathname?.startsWith('/videos/playlists/') === true
      ) {
        router.refresh();
      }
    } finally {
      setMarking(false);
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
          {channelSourceId != null && channelPlatform != null && (
            <ExternalLinkActions
              url={buildChannelLink(channelPlatform, channelSourceId).url}
              label={`Open channel on ${buildChannelLink(channelPlatform, channelSourceId).platformName}`}
            />
          )}
          {trailing}
          {channelId == null && unreadCount > 0 && (
            <span className="shrink-0 rounded-full bg-blue-100 px-1.5 py-0.5 text-xs font-medium text-blue-700">
              {unreadCount}
            </span>
          )}
          {showRefresh && (
            <button
              onClick={handleRefreshChannel}
              disabled={refreshDisabled}
              className="hidden shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50 disabled:hover:bg-transparent sidebar:inline-flex"
              title={refreshTooltip}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              <span className="hidden sidebar:inline">
                {refreshing ? 'Refreshing…' : 'Refresh'}
              </span>
            </button>
          )}
          {unreadCount > 0 && (
            <button
              onClick={handleMarkAllRead}
              disabled={marking}
              className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50 disabled:hover:bg-transparent"
              title="Mark all as read"
            >
              <CheckIcon className="h-4 w-4" />
              <span className="hidden sidebar:inline">
                {marking ? 'Marking…' : 'Mark all as read'}
              </span>
            </button>
          )}
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
