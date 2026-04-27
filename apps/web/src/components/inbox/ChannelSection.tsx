'use client';

import { TooltipProvider } from '@/components/ui/tooltip';
import type { ChannelData } from '@/lib/types';

import FolderSection from './FolderSection';
import VideosSection from './VideosSection';
import ViewsSection from './ViewsSection';

interface Props {
  channels: ChannelData[];
  selectedChannelId: string | null;
  totalUnread: number;
  /** Open the AddChannelModal owned by DashboardShell. The optional
   *  folderId pre-selects a destination folder so a "+" entry on a
   *  folder row drops the new channel straight into that folder. */
  onAddChannel: (folderId?: string | null) => void;
  /** Open the AddVideoModal owned by DashboardShell. The optional
   *  playlistId pre-selects a destination playlist for the new video. */
  onAddVideo: (playlistId?: string | null) => void;
}

/**
 * Left sidebar content below the app topbar. Two sections:
 *
 *   1. Views — Inbox + the triage buckets (Starred / Read Later /
 *      Archived). Inbox is the default view and shows the
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
  onAddVideo,
}: Props) {
  return (
    <TooltipProvider delayDuration={300}>
      <nav className="flex min-w-0 flex-col overflow-x-hidden overflow-y-auto">
        <ViewsSection inboxUnread={totalUnread} />
        <VideosSection onAddVideo={onAddVideo} />
        <FolderSection
          channels={channels}
          selectedChannelId={selectedChannelId}
          onAddChannel={onAddChannel}
        />
      </nav>
    </TooltipProvider>
  );
}
