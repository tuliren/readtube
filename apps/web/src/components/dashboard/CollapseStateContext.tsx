'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

/**
 * Per-user sidebar collapse preferences, persisted to localStorage so
 * they survive page navigation AND full reloads. A single key holds
 * both section-level flags (Views, Channels) and the per-folder
 * collapsed set, so a migration lives in one place if the shape
 * changes.
 *
 * SSR initial state is all-expanded: we can't read localStorage
 * server-side, and rendering "collapsed" on first paint would trigger
 * a React hydration mismatch for every user who has collapsed anything.
 * The `useEffect` on mount reads storage and reconciles. Users who
 * collapsed something will see a brief expand→collapse flash on first
 * load; that's acceptable and avoids hydration mismatches. CSS-only
 * hiding would skip the flash but also leave the DnD + a11y tree
 * mounted, which is more expensive and leaks focus to hidden rows.
 */
interface PersistedState {
  viewsCollapsed: boolean;
  channelsCollapsed: boolean;
  videosCollapsed: boolean;
  collapsedFolderIds: string[];
}

const STORAGE_KEY = 'readtube.sidebar.collapse';
const DEFAULT_STATE: PersistedState = {
  viewsCollapsed: false,
  channelsCollapsed: false,
  videosCollapsed: false,
  collapsedFolderIds: [],
};

interface EnsureExpandedInput {
  /** The folder id currently showing an active child, if any. */
  folderId?: string | null;
  /** True when the active page narrows to a single channel. */
  channelSelected?: boolean;
  /** True when a non-default view (Starred / Read Later / Archived) is active. */
  nonDefaultView?: boolean;
  /** True when the active page is under /videos (All/Standalone/playlist). */
  videosSelected?: boolean;
}

interface CollapseState {
  viewsCollapsed: boolean;
  channelsCollapsed: boolean;
  videosCollapsed: boolean;
  isFolderCollapsed: (folderId: string) => boolean;
  toggleViews: () => void;
  toggleChannels: () => void;
  toggleVideos: () => void;
  toggleFolder: (folderId: string) => void;
  ensureExpandedFor: (input: EnsureExpandedInput) => void;
}

const CollapseCtx = createContext<CollapseState | null>(null);

function parseStored(raw: string | null): PersistedState {
  if (raw == null) {
    return DEFAULT_STATE;
  }
  try {
    const parsed = JSON.parse(raw) as Partial<PersistedState>;
    return {
      viewsCollapsed: parsed.viewsCollapsed === true,
      channelsCollapsed: parsed.channelsCollapsed === true,
      videosCollapsed: parsed.videosCollapsed === true,
      collapsedFolderIds: Array.isArray(parsed.collapsedFolderIds)
        ? parsed.collapsedFolderIds.filter((id): id is string => typeof id === 'string')
        : [],
    };
  } catch {
    return DEFAULT_STATE;
  }
}

export function CollapseStateProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<PersistedState>(DEFAULT_STATE);
  const [hydrated, setHydrated] = useState(false);

  // Hydrate from localStorage on mount. Guarded by the `hydrated` flag
  // so the write-back effect below doesn't stomp an empty default over
  // real saved state on first render.
  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    setState(parseStored(window.localStorage.getItem(STORAGE_KEY)));
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated || typeof window === 'undefined') {
      return;
    }
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state, hydrated]);

  const toggleViews = useCallback(() => {
    setState((prev) => ({ ...prev, viewsCollapsed: !prev.viewsCollapsed }));
  }, []);

  const toggleChannels = useCallback(() => {
    setState((prev) => ({ ...prev, channelsCollapsed: !prev.channelsCollapsed }));
  }, []);

  const toggleVideos = useCallback(() => {
    setState((prev) => ({ ...prev, videosCollapsed: !prev.videosCollapsed }));
  }, []);

  const toggleFolder = useCallback((folderId: string) => {
    setState((prev) => {
      const set = new Set(prev.collapsedFolderIds);
      if (set.has(folderId)) {
        set.delete(folderId);
      } else {
        set.add(folderId);
      }
      return { ...prev, collapsedFolderIds: Array.from(set) };
    });
  }, []);

  const ensureExpandedFor = useCallback((input: EnsureExpandedInput) => {
    setState((prev) => {
      let next = prev;
      if (input.channelSelected === true && prev.channelsCollapsed) {
        next = { ...next, channelsCollapsed: false };
      }
      if (input.nonDefaultView === true && prev.viewsCollapsed) {
        next = { ...next, viewsCollapsed: false };
      }
      if (input.videosSelected === true && prev.videosCollapsed) {
        next = { ...next, videosCollapsed: false };
      }
      if (input.folderId != null && prev.collapsedFolderIds.includes(input.folderId)) {
        const folderId = input.folderId;
        next = {
          ...next,
          collapsedFolderIds: prev.collapsedFolderIds.filter((id) => id !== folderId),
        };
      }
      return next === prev ? prev : next;
    });
  }, []);

  const collapsedFolderSet = useMemo(
    () => new Set(state.collapsedFolderIds),
    [state.collapsedFolderIds]
  );

  const value = useMemo<CollapseState>(
    () => ({
      viewsCollapsed: state.viewsCollapsed,
      channelsCollapsed: state.channelsCollapsed,
      videosCollapsed: state.videosCollapsed,
      isFolderCollapsed: (folderId: string) => collapsedFolderSet.has(folderId),
      toggleViews,
      toggleChannels,
      toggleVideos,
      toggleFolder,
      ensureExpandedFor,
    }),
    [
      state.viewsCollapsed,
      state.channelsCollapsed,
      state.videosCollapsed,
      collapsedFolderSet,
      toggleViews,
      toggleChannels,
      toggleVideos,
      toggleFolder,
      ensureExpandedFor,
    ]
  );

  return <CollapseCtx.Provider value={value}>{children}</CollapseCtx.Provider>;
}

export function useCollapseState(): CollapseState {
  const ctx = useContext(CollapseCtx);
  if (ctx == null) {
    throw new Error('useCollapseState must be used within CollapseStateProvider');
  }
  return ctx;
}
