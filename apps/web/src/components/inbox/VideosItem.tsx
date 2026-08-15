'use client';

import { Plus, Video } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { useSidebarData } from '@/components/dashboard/SidebarDataContext';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

import { useSidebar } from './SidebarContext';
import { SidebarBadge } from './SidebarRow';

interface Props {
  /** Open the AddVideoModal (no playlist pre-selected). */
  onAddVideo: () => void;
}

/**
 * Sidebar "Standalone videos" entry — a single clickable row (no
 * sub-items) between Views and Playlists that opens the user's
 * standalone video library. Named explicitly ("Videos" alone reads as
 * if it included playlist and channel videos too). The label carries
 * the same section-title typography as the Playlists/Channels
 * headers, and the always-visible "+" opens the AddVideoModal
 * directly; adding a video to a specific playlist lives in the
 * Playlists section's per-row dropdown.
 */
export default function VideosItem({ onAddVideo }: Props) {
  const pathname = usePathname();
  const { collapsed } = useSidebar();
  const { libraryCounts } = useSidebarData();
  const active = pathname === '/videos/standalone';
  const unread = libraryCounts?.standaloneUnread ?? 0;

  if (collapsed) {
    return (
      <div className="px-1 pt-4">
        <Tooltip>
          <TooltipTrigger asChild>
            <Link
              href="/videos/standalone"
              className={`flex items-center justify-center rounded-md p-2 ${
                active
                  ? 'bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300'
                  : 'text-foreground hover:bg-accent'
              }`}
            >
              <Video className="h-4 w-4" />
            </Link>
          </TooltipTrigger>
          <TooltipContent side="right">
            Standalone videos
            {unread > 0 ? ` (${unread})` : ''}
          </TooltipContent>
        </Tooltip>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between px-3 pt-4">
      <Link
        href="/videos/standalone"
        className={`flex min-w-0 flex-1 items-center gap-1 rounded-md py-0.5 pl-2 ${
          active ? 'bg-blue-50 dark:bg-blue-500/15' : 'hover:bg-accent'
        }`}
      >
        {/* Chevron-width spacer: the sibling section headers
            (Playlists / Channels) lead with a h-3.5 w-3.5 chevron,
            so this keeps the label text on the same column even
            though a single entry has nothing to collapse. */}
        <span aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
        <span
          className={`truncate text-base font-semibold ${
            active ? 'text-blue-700 dark:text-blue-300' : 'text-foreground'
          }`}
        >
          Standalone videos
        </span>
        <SidebarBadge count={unread} />
      </Link>
      <button
        type="button"
        onClick={onAddVideo}
        className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
        aria-label="Add video"
        title="Add video"
      >
        <Plus className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
