'use client';

import {
  ChevronDown,
  ChevronRight,
  List,
  ListMusic,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
  Video,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';

import { useCollapseState } from '@/components/dashboard/CollapseStateContext';
import { type PlaylistRow, useSidebarData } from '@/components/dashboard/SidebarDataContext';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

import DeletePlaylistDialog from './DeletePlaylistDialog';
import NewPlaylistDialog from './NewPlaylistDialog';
import RenamePlaylistDialog from './RenamePlaylistDialog';
import { useSidebar } from './SidebarContext';
import { SidebarBadge, SidebarRowContent, sidebarRowClass } from './SidebarRow';

/**
 * User-facing display label for a playlist. When the user has set a
 * custom name, show it as the primary label and append the original
 * in parentheses.
 */
function playlistDisplayName(p: { name: string; customName: string | null }): string {
  if (p.customName != null && p.customName.length > 0) {
    return `${p.customName} (${p.name})`;
  }
  return p.name;
}

interface Props {
  /** Open the AddVideoModal. The optional playlistId pre-selects a
   *  destination playlist when invoked from a per-playlist dropdown. */
  onAddVideo: (playlistId?: string | null) => void;
}

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
export default function VideosSection({ onAddVideo }: Props) {
  const pathname = usePathname();
  const { collapsed } = useSidebar();
  const { videosCollapsed, toggleVideos } = useCollapseState();
  const { playlists, mutatePlaylists, libraryCounts: libCounts } = useSidebarData();
  const [addPlaylistOpen, setAddPlaylistOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [renameTarget, setRenameTarget] = useState<{
    id: string;
    name: string;
    customName: string | null;
  } | null>(null);

  const sectionCollapsed = !collapsed && videosCollapsed;

  const isStandaloneActive = pathname === '/videos/standalone';
  const activePlaylistId = pathname?.startsWith('/videos/playlists/')
    ? pathname.slice('/videos/playlists/'.length).split('/')[0]
    : null;

  return (
    <div className={collapsed ? 'px-1 pt-4' : 'px-3 pt-4'}>
      {!collapsed && (
        <div className="mb-1 flex items-center justify-between pl-2">
          <button
            type="button"
            onClick={toggleVideos}
            className="flex items-center gap-1 text-left"
            aria-expanded={!sectionCollapsed}
            aria-label={sectionCollapsed ? 'Expand videos' : 'Collapse videos'}
          >
            {sectionCollapsed ? (
              <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            )}
            <span className="text-base font-semibold text-foreground">Videos</span>
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground data-[state=open]:bg-accent data-[state=open]:text-foreground"
                aria-label="Add video or playlist"
                title="Add video or playlist"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem onSelect={() => onAddVideo(null)}>
                <Video className="mr-2 h-4 w-4 text-muted-foreground" />
                Add video
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setAddPlaylistOpen(true)}>
                <ListMusic className="mr-2 h-4 w-4 text-muted-foreground" />
                Add playlist
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
      {sectionCollapsed ? null : (
        <ul className="space-y-0.5">
          <VideoEntry
            href="/videos/standalone"
            label="Standalone"
            icon={List}
            active={isStandaloneActive}
            sidebarCollapsed={collapsed}
            unreadCount={libCounts?.standaloneUnread}
          />
          {playlists.map((p) => (
            <PlaylistEntry
              key={p.id}
              playlist={p}
              active={activePlaylistId === p.id}
              sidebarCollapsed={collapsed}
              onRequestAddVideo={() => onAddVideo(p.id)}
              onRequestRename={() =>
                setRenameTarget({ id: p.id, name: p.name, customName: p.customName })
              }
              onRequestDelete={() => setDeleteTarget({ id: p.id, name: playlistDisplayName(p) })}
            />
          ))}
        </ul>
      )}

      <NewPlaylistDialog
        open={addPlaylistOpen}
        onOpenChange={setAddPlaylistOpen}
        onCreated={() => void mutatePlaylists()}
      />
      <RenamePlaylistDialog target={renameTarget} onClose={() => setRenameTarget(null)} />
      <DeletePlaylistDialog target={deleteTarget} onClose={() => setDeleteTarget(null)} />
    </div>
  );
}

interface PlaylistEntryProps {
  playlist: PlaylistRow;
  active: boolean;
  sidebarCollapsed: boolean;
  onRequestAddVideo: () => void;
  onRequestRename: () => void;
  onRequestDelete: () => void;
}

/**
 * A playlist row with a hover-visible ⋯ dropdown for per-playlist
 * actions (Rename, Delete). Modeled on DraggableChannelLink's
 * pattern so the sidebar looks consistent between channels and
 * playlists.
 */
function PlaylistEntry({
  playlist,
  active,
  sidebarCollapsed,
  onRequestAddVideo,
  onRequestRename,
  onRequestDelete,
}: PlaylistEntryProps) {
  const href = `/videos/playlists/${playlist.id}`;
  const label = playlistDisplayName(playlist);
  if (sidebarCollapsed) {
    return (
      <li>
        <Tooltip>
          <TooltipTrigger asChild>
            <Link
              href={href}
              className={`flex items-center justify-center rounded-md p-2 ${
                active
                  ? 'bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300'
                  : 'text-foreground hover:bg-accent'
              }`}
            >
              {playlist.thumbnailUrl != null ? (
                <img
                  src={playlist.thumbnailUrl}
                  alt=""
                  className="h-4 w-4 rounded-sm object-cover"
                />
              ) : (
                <ListMusic className="h-4 w-4" />
              )}
            </Link>
          </TooltipTrigger>
          <TooltipContent side="right">{label}</TooltipContent>
        </Tooltip>
      </li>
    );
  }
  return (
    <li className="group flex items-center">
      <Link href={href} className={`${sidebarRowClass(active)} min-w-0 flex-1`}>
        {playlist.thumbnailUrl != null ? (
          <>
            <img
              src={playlist.thumbnailUrl}
              alt=""
              className="h-4 w-4 shrink-0 rounded-sm object-cover"
            />
            <span className="truncate">{label}</span>
            <SidebarBadge count={playlist.unreadCount} />
          </>
        ) : (
          <SidebarRowContent
            icon={ListMusic}
            label={label}
            trailing={<SidebarBadge count={playlist.unreadCount} />}
          />
        )}
      </Link>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="ml-0.5 rounded p-1 text-muted-foreground opacity-0 hover:bg-accent hover:text-foreground group-hover:opacity-100 data-[state=open]:opacity-100"
            aria-label="Playlist actions"
            title="Playlist actions"
          >
            <MoreHorizontal className="h-3.5 w-3.5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem onSelect={onRequestAddVideo}>
            <Plus className="mr-2 h-3.5 w-3.5 text-muted-foreground" />
            Add video
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={onRequestRename}>
            <Pencil className="mr-2 h-3.5 w-3.5 text-muted-foreground" />
            Rename
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={onRequestDelete} className="text-red-600 focus:text-red-600">
            <Trash2 className="mr-2 h-3.5 w-3.5" />
            Delete playlist
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
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
                active
                  ? 'bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300'
                  : 'text-foreground hover:bg-accent'
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
