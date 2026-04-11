'use client';

import { CheckIcon } from '@heroicons/react/24/outline';
import { useState } from 'react';
import { useSWRConfig } from 'swr';

interface Props {
  channelId: string | null;
  channelName: string;
  unreadCount: number;
}

export default function InboxHeader({ channelId, channelName, unreadCount }: Props) {
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
      // Refresh the sidebar unread badges and the current video list.
      await Promise.all([
        mutate('/api/channels'),
        mutate(channelId != null ? `/api/videos?channelId=${channelId}` : '/api/videos'),
      ]);
    } finally {
      setMarking(false);
    }
  }

  return (
    <div className="flex h-12 shrink-0 items-center justify-between border-b border-gray-100 bg-white px-4">
      <div className="flex items-center gap-2 min-w-0">
        <h1 className="truncate text-sm font-semibold text-gray-900">{channelName}</h1>
        {unreadCount > 0 && (
          <span className="rounded-full bg-blue-100 px-1.5 py-0.5 text-xs font-medium text-blue-700">
            {unreadCount}
          </span>
        )}
      </div>
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
  );
}
