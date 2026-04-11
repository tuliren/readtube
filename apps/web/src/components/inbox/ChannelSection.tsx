'use client';

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
 *   2. Channels — folder-aware list of subscribed channels. The
 *      "+ Add channel" entry now lives at the top of this section
 *      (right under the Channels header) inside FolderSection so it
 *      sits next to the thing it adds to.
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
      <FolderSection
        channels={channels}
        selectedChannelId={selectedChannelId}
        onAddChannel={onAddChannel}
      />
    </nav>
  );
}
