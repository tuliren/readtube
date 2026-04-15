'use client';

import { CheckIcon } from '@heroicons/react/24/outline';
import { RefreshCw } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { useSWRConfig } from 'swr';

import { isProduction } from '@/lib/vercelEnv';

import ChannelAvatar from './ChannelAvatar';
import FilterBar from './FilterBar';
import Pagination from './Pagination';
import SearchInput from './SearchInput';

interface Props {
  channelId: string | null;
  channelName: string;
  /** Channel logo URL. Only available when viewing a single channel
   *  that has a logo persisted from the scraper. Null for the
   *  Inbox/Starred/etc. aggregate views. */
  channelLogoUrl: string | null;
  unreadCount: number;
  /** Total videos that match the current filter (across all pages).
   *  Drives the Page X of Y control on the right side of the header. */
  totalVideos: number;
}

export default function InboxHeader({
  channelId,
  channelName,
  channelLogoUrl,
  unreadCount,
  totalVideos,
}: Props) {
  const { mutate } = useSWRConfig();
  const router = useRouter();
  const [marking, setMarking] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const showRefresh = !isProduction() && channelId != null;

  async function handleRefreshChannel() {
    if (channelId == null || refreshing) {
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
        body: JSON.stringify(channelId != null ? { channelId } : {}),
      });
      if (!res.ok) {
        return;
      }
      // Refresh the sidebar unread badges and any /api/videos* keys.
      await Promise.all([
        mutate('/api/channels'),
        mutate((key) => typeof key === 'string' && key.startsWith('/api/videos')),
      ]);
    } finally {
      setMarking(false);
    }
  }

  return (
    <div className="flex h-auto shrink-0 flex-col border-b border-gray-100 bg-white">
      {/* Title row — action buttons sit next to the title/badge,
          search stays on the right edge. This keeps the actions
          contextually close to the thing they act on. */}
      <div className="hidden h-12 items-center justify-start gap-2 overflow-hidden px-4 lg:flex">
        <div className="flex min-w-0 items-center gap-2">
          {channelLogoUrl != null && (
            <div className="hidden lg:block">
              <ChannelAvatar url={channelLogoUrl} size={40} cssSize="h-6 w-6" />
            </div>
          )}
          <h1 className="hidden min-w-0 truncate text-sm font-semibold text-gray-900 lg:block">
            {channelName}
          </h1>
          {unreadCount > 0 && (
            <span className="shrink-0 rounded-full bg-blue-100 px-1.5 py-0.5 text-xs font-medium text-blue-700">
              {unreadCount}
            </span>
          )}
          {showRefresh && (
            <button
              onClick={handleRefreshChannel}
              disabled={refreshing}
              className="hidden shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs text-gray-500 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-50 disabled:hover:bg-transparent lg:inline-flex"
              title="Pull latest videos + metadata for this channel"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              <span className="hidden lg:inline">{refreshing ? 'Refreshing…' : 'Refresh'}</span>
            </button>
          )}
          {unreadCount > 0 && (
            <button
              onClick={handleMarkAllRead}
              disabled={marking}
              className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs text-gray-500 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-50 disabled:hover:bg-transparent"
              title="Mark all as read"
            >
              <CheckIcon className="h-4 w-4" />
              <span className="hidden lg:inline">{marking ? 'Marking…' : 'Mark all as read'}</span>
            </button>
          )}
        </div>
      </div>
      {/* Filter chips row + search + pagination on the right. The
          header itself sits above the scrolling video list and never
          scrolls away, so the pagination control is always reachable
          while the user is reading rows. */}
      <div className="flex items-center justify-between gap-2 px-4 py-2 lg:pt-0">
        <FilterBar />
        <div className="flex items-center gap-2">
          <SearchInput />
          <Pagination total={totalVideos} />
        </div>
      </div>
    </div>
  );
}
