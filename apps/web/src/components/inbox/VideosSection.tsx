'use client';

import { ChevronDown, ChevronRight, List, ListMusic, Plus, Video } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import useSWR from 'swr';

import { useCollapseState } from '@/components/dashboard/CollapseStateContext';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

import AddVideoModal from './AddVideoModal';
import NewPlaylistDialog from './NewPlaylistDialog';
import { useSidebar } from './SidebarContext';
import { SidebarRowContent, sidebarRowClass } from './SidebarRow';

interface PlaylistRow {
  id: string;
  name: string;
  sortOrder: number;
  videoCount: number;
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
 *   - + New playlist / + Add video actions
 */
export default function VideosSection() {
  const pathname = usePathname();
  const { collapsed } = useSidebar();
  const { videosCollapsed, toggleVideos } = useCollapseState();
  const [addVideoOpen, setAddVideoOpen] = useState(false);
  const [newPlaylistOpen, setNewPlaylistOpen] = useState(false);

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
        <button
          type="button"
          onClick={toggleVideos}
          className="mb-1 flex w-full items-center gap-1 px-2 text-left"
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
            />
          ))}
          {!collapsed && (
            <>
              <li>
                <button
                  type="button"
                  onClick={() => setAddVideoOpen(true)}
                  className={`${sidebarRowClass(false)} w-full text-left`}
                >
                  <SidebarRowContent icon={Plus} label="Add video" />
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => setNewPlaylistOpen(true)}
                  className={`${sidebarRowClass(false)} w-full text-left`}
                >
                  <SidebarRowContent icon={Plus} label="New playlist" />
                </button>
              </li>
            </>
          )}
        </ul>
      )}

      <AddVideoModal open={addVideoOpen} onOpenChange={setAddVideoOpen} />
      <NewPlaylistDialog
        open={newPlaylistOpen}
        onOpenChange={setNewPlaylistOpen}
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
}

function VideoEntry({ href, label, icon: Icon, active, sidebarCollapsed }: EntryProps) {
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
              <Icon className="h-4 w-4" />
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
        <SidebarRowContent icon={Icon} label={label} />
      </Link>
    </li>
  );
}
