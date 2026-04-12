'use client';

import { CheckIcon } from '@heroicons/react/24/outline';
import { useState } from 'react';
import { useSWRConfig } from 'swr';

import FilterBar from './FilterBar';
import Pagination from './Pagination';
import SavedViewMenu from './SavedViewMenu';
import SearchInput from './SearchInput';

interface Props {
  channelId: string | null;
  channelName: string;
  unreadCount: number;
  /** Total videos that match the current filter (across all pages).
   *  Drives the Page X of Y control on the right side of the header. */
  totalVideos: number;
}

export default function InboxHeader({ channelId, channelName, unreadCount, totalVideos }: Props) {
  const { mutate } = useSWRConfig();
  const [marking, setMarking] = useState(false);

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
      {/* Title row */}
      <div className="flex h-12 items-center justify-between px-4">
        <div className="flex min-w-0 items-center gap-2">
          <h1 className="truncate text-sm font-semibold text-gray-900">{channelName}</h1>
          {unreadCount > 0 && (
            <span className="rounded-full bg-blue-100 px-1.5 py-0.5 text-xs font-medium text-blue-700">
              {unreadCount}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <SearchInput />
          <SavedViewMenu />
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
