'use client';

import { useState } from 'react';

import { TooltipProvider } from '@/components/ui/tooltip';
import type { ChannelData } from '@/lib/types';

import FolderSection from './FolderSection';
import { useSidebar } from './SidebarContext';
import SidebarFilterInput from './SidebarFilterInput';
import SidebarFilterResults from './SidebarFilterResults';
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
 * Left sidebar content below the app topbar. A filter input at the
 * top, then two sections:
 *
 *   1. Views — Inbox + the triage buckets (Starred / Read Later /
 *      Archived). Inbox is the default view and shows the
 *      aggregate unread badge, so the separate "All unread" entry that
 *      used to live at the top is gone.
 *   2. Channels — folder-aware list of subscribed channels. The
 *      "+ Add channel" entry now lives at the top of this section
 *      (right under the Channels header) inside FolderSection so it
 *      sits next to the thing it adds to.
 *
 * While the filter input holds text, the sections are replaced by a
 * flat list of matching navbar items (SidebarFilterResults). The
 * collapsed 56px rail hides the input — there's no room for it, and
 * ⌘K covers search there.
 */
export default function ChannelSection({
  channels,
  selectedChannelId,
  totalUnread,
  onAddChannel,
  onAddVideo,
}: Props) {
  const { collapsed } = useSidebar();
  const [filter, setFilter] = useState('');
  const trimmedFilter = filter.trim();
  const filtering = !collapsed && trimmedFilter.length > 0;

  return (
    <TooltipProvider delayDuration={300}>
      <nav className="flex min-w-0 flex-col overflow-x-hidden overflow-y-auto">
        {!collapsed && <SidebarFilterInput value={filter} onChange={setFilter} />}
        {filtering ? (
          <SidebarFilterResults
            query={trimmedFilter}
            channels={channels}
            selectedChannelId={selectedChannelId}
          />
        ) : (
          <>
            <ViewsSection inboxUnread={totalUnread} />
            <VideosSection onAddVideo={onAddVideo} />
            <FolderSection
              channels={channels}
              selectedChannelId={selectedChannelId}
              onAddChannel={onAddChannel}
            />
          </>
        )}
      </nav>
    </TooltipProvider>
  );
}
