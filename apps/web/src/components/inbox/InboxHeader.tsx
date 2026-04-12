'use client';

import { CheckIcon } from '@heroicons/react/24/outline';
import { RefreshCw } from 'lucide-react';
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
      // Invalidate both the channel list (for updated metadata/logo)
      // and the video list (for new videos + thumbnails).
      await Promise.all([
        mutate('/api/channels'),
        mutate((key) => typeof key === 'string' && key.startsWith('/api/videos')),
      ]);
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
      <div className="flex h-12 items-center justify-between px-4">
        <div className="flex min-w-0 items-center gap-2">
          {channelLogoUrl != null && (
            <ChannelAvatar url={channelLogoUrl} size={24} cssSize="h-6 w-6" />
          )}
          <h1 className="truncate text-sm font-semibold text-gray-900">{channelName}</h1>
          {unreadCount > 0 && (
            <span className="rounded-full bg-blue-100 px-1.5 py-0.5 text-xs font-medium text-blue-700">
              {unreadCount}
            </span>
          )}
          {showRefresh && (
            <button
              onClick={handleRefreshChannel}
              disabled={refreshing}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-gray-500 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-50 disabled:hover:bg-transparent"
              title="Pull latest videos + metadata for this channel"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              {refreshing ? 'Refreshing…' : 'Refresh'}
            </button>
          )}
          {unreadCount > 0 && (
            <button
              onClick={handleMarkAllRead}
              disabled={marking}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-gray-500 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-50 disabled:hover:bg-transparent"
              title="Mark all as read"
            >
              <CheckIcon className="h-4 w-4" />
              {marking ? 'Marking…' : 'Mark all as read'}
            </button>
          )}
        </div>
        <SearchInput />
      </div>
      {/* Filter chips row + pagination on the right. The header
          itself sits above the scrolling video list and never
          scrolls away, so the pagination control is always
          reachable while the user is reading rows. */}
      <div className="flex items-center justify-between px-4 pb-2 pt-0">
        <FilterBar />
        <Pagination total={totalVideos} />
      </div>
    </div>
  );
}
