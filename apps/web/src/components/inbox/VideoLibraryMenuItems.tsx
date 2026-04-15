'use client';

import { ListMusic, Plus, Trash2 } from 'lucide-react';
import useSWR from 'swr';

import {
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from '@/components/ui/dropdown-menu';
import type { VideoData } from '@/lib/types';

import { useTriage } from './useTriage';

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
 * Drop-in dropdown items for the "library" actions on a VideoRow:
 *   - Add to playlist… (submenu with the user's playlists)
 *   - Remove from library (only when the video is in the user's
 *     StandaloneVideo set)
 *
 * Kept as shared JSX so the mobile all-in-one dropdown and the
 * desktop dedicated library dropdown stay in sync.
 */
export default function VideoLibraryMenuItems({ video }: { video: VideoData }) {
  const triage = useTriage();
  const { data: playlists = [] } = useSWR<PlaylistRow[]>('/api/playlists', fetcher);

  return (
    <>
      <DropdownMenuSub>
        <DropdownMenuSubTrigger>
          <ListMusic className="mr-2 h-4 w-4 text-gray-400" />
          Add to playlist…
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent className="w-56">
          {playlists.length === 0 ? (
            <DropdownMenuItem disabled>
              <span className="text-xs text-gray-500">No playlists yet</span>
            </DropdownMenuItem>
          ) : (
            playlists.map((p) => (
              <DropdownMenuItem
                key={p.id}
                onSelect={() => void triage.addToPlaylist(video.id, p.id)}
              >
                <Plus className="mr-2 h-4 w-4 text-gray-400" />
                <span className="truncate">{p.name}</span>
              </DropdownMenuItem>
            ))
          )}
        </DropdownMenuSubContent>
      </DropdownMenuSub>

      {video.isStandalone && (
        <>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => void triage.removeFromLibrary(video.id)}>
            <Trash2 className="mr-2 h-4 w-4 text-red-400" />
            Remove from library
          </DropdownMenuItem>
        </>
      )}
    </>
  );
}
