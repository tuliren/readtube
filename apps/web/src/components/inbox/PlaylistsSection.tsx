'use client';

import {
  ChevronDown,
  ChevronRight,
  ListMusic,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';

import { useCollapseState } from '@/components/dashboard/CollapseStateContext';
import { useDashboard } from '@/components/dashboard/DashboardContext';
import { type PlaylistRow, useSidebarData } from '@/components/dashboard/SidebarDataContext';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { playlistDisplayName } from '@/lib/inbox/playlistName';

import DeletePlaylistDialog from './DeletePlaylistDialog';
import RailPlaylistsMenu from './RailPlaylistsMenu';
import RefreshSourceMenuItem from './RefreshSourceMenuItem';
import RenamePlaylistDialog from './RenamePlaylistDialog';
import { useSidebar } from './SidebarContext';
import { SidebarBadge, SidebarRowContent, sidebarRowClass } from './SidebarRow';

interface Props {
  /** Open the AddVideoModal pre-targeted at a playlist, used by the
   *  per-playlist dropdown's "Add video" item. */
  onAddVideo: (playlistId?: string | null) => void;
}

/**
 * Sidebar "Playlists" section — one row per user playlist, between the
 * Videos entry and Channels. The "+" dropdown next to the header
 * (matching the Channels section pattern) holds "Add playlist";
 * per-playlist actions (Add video / Rename / Delete) live in each
 * row's hover dropdown.
 */
export default function PlaylistsSection({ onAddVideo }: Props) {
  const pathname = usePathname();
  const { collapsed } = useSidebar();
  const { playlistsCollapsed, togglePlaylists } = useCollapseState();
  const { playlists } = useSidebarData();
  const { openAdd } = useDashboard();
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [renameTarget, setRenameTarget] = useState<{
    id: string;
    name: string;
    customName: string | null;
  } | null>(null);

  const sectionCollapsed = !collapsed && playlistsCollapsed;

  const activePlaylistId = pathname?.startsWith('/videos/playlists/')
    ? pathname.slice('/videos/playlists/'.length).split('/')[0]
    : null;

  // Collapsed rail: one Playlists icon whose menu lists every playlist,
  // instead of one icon per playlist.
  if (collapsed) {
    return (
      <div className="px-1 pt-0.5">
        <RailPlaylistsMenu
          playlists={playlists}
          activePlaylistId={activePlaylistId}
          onAddPlaylist={() => openAdd({ kind: 'playlist' })}
        />
      </div>
    );
  }

  return (
    <div className="px-3 pt-4">
      <div className="mb-1 flex items-center justify-between">
        <button
          type="button"
          onClick={togglePlaylists}
          className="flex flex-1 items-center gap-1 pl-2 text-left"
          aria-expanded={!sectionCollapsed}
          aria-label={sectionCollapsed ? 'Expand playlists' : 'Collapse playlists'}
        >
          {sectionCollapsed ? (
            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          )}
          <span className="text-base font-semibold text-foreground">Playlists</span>
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground data-[state=open]:bg-accent data-[state=open]:text-foreground"
              aria-label="Add playlist"
              title="Add playlist"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem onSelect={() => openAdd({ kind: 'playlist' })}>
              <ListMusic className="mr-2 h-4 w-4 text-muted-foreground" />
              Add playlist
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {sectionCollapsed ? null : (
        <ul className="space-y-0.5">
          {playlists.map((p) => (
            <PlaylistEntry
              key={p.id}
              playlist={p}
              active={activePlaylistId === p.id}
              onRequestAddVideo={() => onAddVideo(p.id)}
              onRequestRename={() =>
                setRenameTarget({ id: p.id, name: p.name, customName: p.customName })
              }
              onRequestDelete={() => setDeleteTarget({ id: p.id, name: playlistDisplayName(p) })}
            />
          ))}
        </ul>
      )}

      <RenamePlaylistDialog target={renameTarget} onClose={() => setRenameTarget(null)} />
      <DeletePlaylistDialog
        target={deleteTarget}
        currentPlaylistId={activePlaylistId}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  );
}

interface PlaylistEntryProps {
  playlist: PlaylistRow;
  active: boolean;
  onRequestAddVideo: () => void;
  onRequestRename: () => void;
  onRequestDelete: () => void;
}

/**
 * A playlist row with a hover-visible ⋯ dropdown for per-playlist
 * actions (Add video, Rename, Delete). Modeled on
 * DraggableChannelLink's pattern so the sidebar looks consistent
 * between channels and playlists.
 */
function PlaylistEntry({
  playlist,
  active,
  onRequestAddVideo,
  onRequestRename,
  onRequestDelete,
}: PlaylistEntryProps) {
  const href = `/videos/playlists/${playlist.id}`;
  const label = playlistDisplayName(playlist);
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
          <RefreshSourceMenuItem
            source="playlists"
            id={playlist.id}
            checkedAt={playlist.checkedAt}
          />
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
