'use client';

import { createContext, useCallback, useContext, useMemo } from 'react';
import type { KeyedMutator } from 'swr';
import useSWR, { useSWRConfig } from 'swr';

import type { ChannelData, FolderData } from '@/lib/types';

export interface PlaylistRow {
  id: string;
  name: string;
  customName: string | null;
  sortOrder: number;
  videoCount: number;
  unreadCount: number;
  thumbnailUrl: string | null;
}

export interface LibraryCounts {
  standaloneUnread: number;
}

/**
 * Centralized state for everything the sidebar renders. Subscribes
 * once to /api/channels, /api/folders, /api/playlists, and
 * /api/videos/library-counts via SWR, exposes the data + SWR mutators
 * to descendants, and provides a single `revalidateUnreadCounts` call
 * that consumers (e.g. the video reader, which auto-marks-as-read on
 * the server) can fire to refresh every unread badge in one shot.
 *
 * SSR fallback data is threaded through `initialChannels` and
 * `initialFolders` so foldered channels don't briefly flash at root
 * while the client SWR fetches resolve. Playlists and library-counts
 * arrive client-side only — the sidebar tolerates a few-hundred-ms
 * empty state on those rows.
 */
export interface SidebarData {
  channels: ChannelData[];
  mutateChannels: KeyedMutator<ChannelData[]>;
  folders: FolderData[];
  mutateFolders: KeyedMutator<FolderData[]>;
  playlists: PlaylistRow[];
  mutatePlaylists: KeyedMutator<PlaylistRow[]>;
  libraryCounts: LibraryCounts | undefined;
  mutateLibraryCounts: KeyedMutator<LibraryCounts>;
  /** Revalidate every endpoint that backs an unread badge in the sidebar. */
  revalidateUnreadCounts: () => void;
  /** Invalidate folder + channel state after a folder edit. */
  invalidateFoldersAndChannels: () => void;
}

const SidebarDataCtx = createContext<SidebarData | null>(null);

const fetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) {
      throw new Error(`Fetch error: ${r.status}`);
    }
    return r.json();
  });

interface ProviderProps {
  initialChannels: ChannelData[];
  initialFolders: FolderData[];
  children: React.ReactNode;
}

export function SidebarDataProvider({ initialChannels, initialFolders, children }: ProviderProps) {
  const { mutate: mutateGlobal } = useSWRConfig();

  const { data: channels = initialChannels, mutate: mutateChannels } = useSWR<ChannelData[]>(
    '/api/channels',
    fetcher,
    { fallbackData: initialChannels }
  );
  const { data: folders = initialFolders, mutate: mutateFolders } = useSWR<FolderData[]>(
    '/api/folders',
    fetcher,
    { fallbackData: initialFolders }
  );
  const { data: playlists = [], mutate: mutatePlaylists } = useSWR<PlaylistRow[]>(
    '/api/playlists',
    fetcher
  );
  const { data: libraryCounts, mutate: mutateLibraryCounts } = useSWR<LibraryCounts>(
    '/api/videos/library-counts',
    fetcher
  );

  const revalidateUnreadCounts = useCallback(() => {
    void mutateGlobal('/api/channels');
    void mutateGlobal('/api/playlists');
    void mutateGlobal('/api/videos/library-counts');
  }, [mutateGlobal]);

  const invalidateFoldersAndChannels = useCallback(() => {
    void mutateGlobal('/api/folders');
    void mutateGlobal('/api/channels');
  }, [mutateGlobal]);

  const value = useMemo<SidebarData>(
    () => ({
      channels,
      mutateChannels,
      folders,
      mutateFolders,
      playlists,
      mutatePlaylists,
      libraryCounts,
      mutateLibraryCounts,
      revalidateUnreadCounts,
      invalidateFoldersAndChannels,
    }),
    [
      channels,
      mutateChannels,
      folders,
      mutateFolders,
      playlists,
      mutatePlaylists,
      libraryCounts,
      mutateLibraryCounts,
      revalidateUnreadCounts,
      invalidateFoldersAndChannels,
    ]
  );

  return <SidebarDataCtx.Provider value={value}>{children}</SidebarDataCtx.Provider>;
}

export function useSidebarData(): SidebarData {
  const ctx = useContext(SidebarDataCtx);
  if (ctx == null) {
    throw new Error('useSidebarData must be used within SidebarDataProvider');
  }
  return ctx;
}
