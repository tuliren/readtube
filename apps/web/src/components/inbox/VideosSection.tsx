'use client';

import { ChevronDown, ChevronRight, List, ListMusic, Plus, Video } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import useSWR from 'swr';

import { useCollapseState } from '@/components/dashboard/CollapseStateContext';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

import AddVideoModal from './AddVideoModal';
import NewPlaylistDialog from './NewPlaylistDialog';
import { useSidebar } from './SidebarContext';
import { SidebarBadge, SidebarRowContent, sidebarRowClass } from './SidebarRow';

interface PlaylistRow {
  id: string;
  name: string;
  sortOrder: number;
  videoCount: number;
  unreadCount: number;
  thumbnailUrl: string | null;
}

const fetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) {
      throw new Error(`Fetch error: ${r.status}`);
    }
    return r.json();
  });

/**
 * Sidebar "Videos" section — entry points to the user's personal video
 * library (StandaloneVideo + playlists). Sits between Views and Channels
 * in the sidebar.
 *
 * Entries:
 *   - All        — every video the user has added (union, incl. in playlists)
 *   - Standalone — videos NOT in any playlist
 *   - <playlist> — one row per user playlist
 *
 * The "+" dropdown next to the section header (matching the Channels
 * section pattern) contains "Add video" and "Add playlist".
 */
export default function VideosSection() {
  const pathname = usePathname();
  const { collapsed } = useSidebar();
  const { videosCollapsed, toggleVideos } = useCollapseState();
  const [addVideoOpen, setAddVideoOpen] = useState(false);
  const [addPlaylistOpen, setAddPlaylistOpen] = useState(false);

  const { data: playlists = [], mutate } = useSWR<PlaylistRow[]>('/api/playlists', fetcher);

  const sectionCollapsed = !collapsed && videosCollapsed;

  const isAllActive = pathname === '/videos';
  const isStandaloneActive = pathname === '/videos/standalone';
  const activePlaylistId = pathname?.startsWith('/videos/playlists/')
    ? pathname.slice('/videos/playlists/'.length).split('/')[0]
    : null;

  return (
    <div className={collapsed ? 'px-1 pt-4' : 'px-3 pt-4'}>
      {!collapsed && (
        <div className="mb-1 flex items-center justify-between px-2">
          <button
            type="button"
            onClick={toggleVideos}
            className="flex items-center gap-1 text-left"
            aria-expanded={!sectionCollapsed}
            aria-label={sectionCollapsed ? 'Expand videos' : 'Collapse videos'}
          >
            {sectionCollapsed ? (
              <ChevronRight className="h-3.5 w-3.5 shrink-0 text-gray-500" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5 shrink-0 text-gray-500" />
            )}
            <span className="text-base font-semibold text-gray-900">Videos</span>
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 data-[state=open]:bg-gray-100 data-[state=open]:text-gray-600"
                aria-label="Add video or playlist"
                title="Add video or playlist"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem onSelect={() => setAddVideoOpen(true)}>
                <Video className="mr-2 h-4 w-4 text-gray-500" />
                Add video
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setAddPlaylistOpen(true)}>
                <ListMusic className="mr-2 h-4 w-4 text-gray-500" />
                Add playlist
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
      {sectionCollapsed ? null : (
        <ul className="space-y-0.5">
          <VideoEntry
            href="/videos"
            label="All"
            icon={Video}
            active={isAllActive}
            sidebarCollapsed={collapsed}
          />
          <VideoEntry
            href="/videos/standalone"
            label="Standalone"
            icon={List}
            active={isStandaloneActive}
            sidebarCollapsed={collapsed}
          />
          {playlists.map((p) => (
            <VideoEntry
              key={p.id}
              href={`/videos/playlists/${p.id}`}
              label={p.name}
              icon={ListMusic}
              active={activePlaylistId === p.id}
              sidebarCollapsed={collapsed}
              thumbnailUrl={p.thumbnailUrl}
              unreadCount={p.unreadCount}
            />
          ))}
        </ul>
      )}

      <AddVideoModal open={addVideoOpen} onOpenChange={setAddVideoOpen} />
      <NewPlaylistDialog
        open={addPlaylistOpen}
        onOpenChange={setAddPlaylistOpen}
        onCreated={() => void mutate()}
      />
    </div>
  );
}

interface EntryProps {
  href: string;
  label: string;
  icon: typeof Video;
  active: boolean;
  sidebarCollapsed: boolean;
  thumbnailUrl?: string | null;
  unreadCount?: number;
}

function VideoEntry({
  href,
  label,
  icon: Icon,
  active,
  sidebarCollapsed,
  thumbnailUrl,
  unreadCount,
}: EntryProps) {
  if (sidebarCollapsed) {
    return (
      <li>
        <Tooltip>
          <TooltipTrigger asChild>
            <Link
              href={href}
              className={`flex items-center justify-center rounded-md p-2 ${
                active ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-100'
              }`}
            >
              {thumbnailUrl != null ? (
                <img src={thumbnailUrl} alt="" className="h-4 w-4 rounded-sm object-cover" />
              ) : (
                <Icon className="h-4 w-4" />
              )}
            </Link>
          </TooltipTrigger>
          <TooltipContent side="right">{label}</TooltipContent>
        </Tooltip>
      </li>
    );
  }
  return (
    <li>
      <Link href={href} className={sidebarRowClass(active)}>
        {thumbnailUrl != null ? (
          <>
            <img src={thumbnailUrl} alt="" className="h-4 w-4 shrink-0 rounded-sm object-cover" />
            <span className="truncate">{label}</span>
            <SidebarBadge count={unreadCount ?? 0} />
          </>
        ) : (
          <SidebarRowContent
            icon={Icon}
            label={label}
            trailing={<SidebarBadge count={unreadCount ?? 0} />}
          />
        )}
      </Link>
    </li>
  );
}
