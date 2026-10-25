'use client';

import { ListMusic, Plus } from 'lucide-react';

import type { PlaylistRow } from '@/components/dashboard/SidebarDataContext';
import { DropdownMenuItem, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { playlistDisplayName } from '@/lib/inbox/playlistName';

import { RailMenu, RailMenuLink } from './RailMenu';

interface Props {
  playlists: PlaylistRow[];
  activePlaylistId: string | null;
  onAddPlaylist: () => void;
}

/** Collapsed-rail Playlists category: one icon, every playlist in its menu. */
export default function RailPlaylistsMenu({ playlists, activePlaylistId, onAddPlaylist }: Props) {
  return (
    <RailMenu icon={ListMusic} label="Playlists" active={activePlaylistId != null}>
      {playlists.length === 0 ? (
        <DropdownMenuItem disabled>No playlists yet</DropdownMenuItem>
      ) : (
        playlists.map((playlist) => (
          <RailMenuLink
            key={playlist.id}
            href={`/videos/playlists/${playlist.id}`}
            label={playlistDisplayName(playlist)}
            unread={playlist.unreadCount}
            active={playlist.id === activePlaylistId}
            leading={
              playlist.thumbnailUrl != null ? (
                <img
                  src={playlist.thumbnailUrl}
                  alt=""
                  className="h-4 w-4 rounded-sm object-cover"
                />
              ) : (
                <ListMusic className="h-4 w-4 text-muted-foreground" />
              )
            }
          />
        ))
      )}
      <DropdownMenuSeparator />
      <DropdownMenuItem onSelect={onAddPlaylist}>
        <Plus className="mr-2 h-4 w-4 text-muted-foreground" />
        Add playlist
      </DropdownMenuItem>
    </RailMenu>
  );
}
