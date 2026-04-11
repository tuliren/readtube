'use client';

import { PlusIcon } from '@heroicons/react/24/outline';
import Link from 'next/link';

import type { ChannelData } from '@/lib/types';

import FolderSection from './FolderSection';
import ViewsSection from './ViewsSection';

interface Props {
  channels: ChannelData[];
  selectedChannelId: string | null;
  totalUnread: number;
  onAddChannel: () => void;
}

export default function ChannelSection({
  channels,
  selectedChannelId,
  totalUnread,
  onAddChannel,
}: Props) {
  return (
    <nav className="flex flex-col overflow-y-auto">
      {/* Inbox section */}
      <div className="px-3 pb-1 pt-4">
        <p className="mb-1 px-2 text-xs font-semibold uppercase tracking-wider text-gray-400">
          Inbox
        </p>
        <Link
          href="/inbox"
          className={`flex items-center justify-between rounded-md px-2 py-1.5 text-sm ${
            selectedChannelId === null
              ? 'bg-blue-50 font-medium text-blue-700'
              : 'text-gray-700 hover:bg-gray-100'
          }`}
        >
          <span>All unread</span>
          {totalUnread > 0 && (
            <span className="rounded-full bg-blue-600 px-1.5 py-0.5 text-xs font-medium text-white">
              {totalUnread}
            </span>
          )}
        </Link>
      </div>

      {/* Persistent triage views: Starred / Read Later / Snoozed / Archived */}
      <ViewsSection />

      {/* Channels grouped by folder (with drag-and-drop) */}
      <FolderSection channels={channels} selectedChannelId={selectedChannelId} />

      <div className="px-3 pt-4">
        {channels.length === 0 && (
          <p className="px-2 py-1 text-xs text-gray-400">No channels yet</p>
        )}
        <button
          onClick={onAddChannel}
          className="mt-2 flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-gray-500 hover:bg-gray-100 hover:text-gray-700"
        >
          <PlusIcon className="h-4 w-4" />
          Add channel
        </button>
      </div>
    </nav>
  );
}
