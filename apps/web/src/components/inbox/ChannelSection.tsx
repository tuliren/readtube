'use client';

import { PlusIcon } from '@heroicons/react/24/outline';

import type { ChannelData } from '@/lib/types';

import FolderSection from './FolderSection';
import ViewsSection from './ViewsSection';

interface Props {
  channels: ChannelData[];
  selectedChannelId: string | null;
  totalUnread: number;
  onAddChannel: () => void;
}

/**
 * Left sidebar content below the app topbar. Two sections:
 *
 *   1. Views — Inbox + the triage buckets (Starred / Read Later /
 *      Snoozed / Archived). Inbox is the default view and shows the
 *      aggregate unread badge, so the separate "All unread" entry that
 *      used to live at the top is gone.
 *   2. Channels — folder-aware list of subscribed channels.
 *
 * The "Add channel" button sits at the bottom and opens the shared
 * AddChannelModal owned by InboxShell.
 */
export default function ChannelSection({
  channels,
  selectedChannelId,
  totalUnread,
  onAddChannel,
}: Props) {
  return (
    <nav className="flex flex-col overflow-y-auto">
      <ViewsSection inboxUnread={totalUnread} />

      {/* Channels grouped by folder (with drag-and-drop) */}
      <FolderSection channels={channels} selectedChannelId={selectedChannelId} />

      <div className="px-3 pt-4">
        {channels.length === 0 && (
          <p className="px-3 py-1 text-xs text-gray-400">No channels yet</p>
        )}
        <button
          onClick={onAddChannel}
          className="mt-2 flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-sm text-gray-500 hover:bg-gray-100 hover:text-gray-700"
        >
          <PlusIcon className="h-4 w-4 shrink-0" />
          Add channel
        </button>
      </div>
    </nav>
  );
}
