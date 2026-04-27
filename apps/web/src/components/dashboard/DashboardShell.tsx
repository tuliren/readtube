'use client';

import { UserButton } from '@clerk/nextjs';
import { AdjustmentsHorizontalIcon } from '@heroicons/react/24/outline';
import { CheckIcon } from '@heroicons/react/24/outline';
import { Menu, PanelLeft, RefreshCw } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import useSWR, { useSWRConfig } from 'swr';

import AddChannelModal from '@/components/inbox/AddChannelModal';
import AddVideoModal from '@/components/inbox/AddVideoModal';
import ChannelAvatar from '@/components/inbox/ChannelAvatar';
import ChannelSection from '@/components/inbox/ChannelSection';
import { CommandPaletteProvider } from '@/components/inbox/CommandPalette';
import { KeyboardShortcutsProvider } from '@/components/inbox/KeyboardShortcutsProvider';
import {
  SidebarExpandedOverride,
  SidebarProvider,
  SidebarResizeHandle,
  useSidebar,
} from '@/components/inbox/SidebarContext';
import { useFolders } from '@/components/inbox/useFolders';
import ThemeSelector from '@/components/settings/ThemeSelector';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { Toaster } from '@/components/ui/sonner';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { MANUAL_REFRESH_DAYS, canManuallyRefresh } from '@/lib/channels/staleness';
import { extractInboxSearchParams, parseInboxQuery } from '@/lib/inbox/filter';
import { resolveInboxView } from '@/lib/inbox/views';
import type { ChannelData, FolderData } from '@/lib/types';

import { CollapseStateProvider, useCollapseState } from './CollapseStateContext';
import { DashboardCtx, type DashboardState } from './DashboardContext';
import { SidebarDataProvider, useSidebarData } from './SidebarDataContext';

const fetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) {
      throw new Error(`Fetch error: ${r.status}`);
    }
    return r.json();
  });

interface Props {
  initialChannels: ChannelData[];
  initialFolders: FolderData[];
  children: React.ReactNode;
}

export default function DashboardShell({ initialChannels, initialFolders, children }: Props) {
  return (
    <SidebarProvider>
      <KeyboardShortcutsProvider>
        <CommandPaletteProvider>
          <CollapseStateProvider>
            <SidebarDataProvider initialChannels={initialChannels} initialFolders={initialFolders}>
              <DashboardShellInner>{children}</DashboardShellInner>
            </SidebarDataProvider>
          </CollapseStateProvider>
        </CommandPaletteProvider>
      </KeyboardShortcutsProvider>
    </SidebarProvider>
  );
}

function DashboardShellInner({ children }: { children: React.ReactNode }) {
  const { channels, mutateChannels, revalidateUnreadCounts } = useSidebarData();
  // Pre-select a folder/playlist when the modal is opened from a
  // folder's "Add channel" item or a playlist's "Add video" item, so
  // the new entity lands in the right bucket without an extra step.
  const [addChannelTarget, setAddChannelTarget] = useState<{ folderId: string | null } | null>(
    null
  );
  const [addVideoTarget, setAddVideoTarget] = useState<{ playlistId: string | null } | null>(null);

  const totalUnread = channels.reduce((sum, c) => sum + c.unreadCount, 0);

  function handleChannelAdded(channel: ChannelData) {
    void mutateChannels([...channels, channel].sort((a, b) => a.name.localeCompare(b.name)));
  }

  // The reader page server-renders a UserVideoConsumption upsert, so
  // the channel/playlist/library unread caches are stale by the time
  // the client renders. Revalidate every unread badge endpoint when
  // the URL points at a video reader so the sidebar counts refresh
  // without a manual reload.
  useReaderUnreadSync(revalidateUnreadCounts);

  const dashboardValue = useMemo<DashboardState>(
    () => ({
      channels,
      totalUnread,
      openAddChannel: () => setAddChannelTarget({ folderId: null }),
      mutateChannels,
    }),
    [channels, totalUnread, mutateChannels]
  );

  const selectedChannelId = useSelectedChannelId(channels);
  const selectedChannel =
    selectedChannelId != null ? (channels.find((c) => c.id === selectedChannelId) ?? null) : null;
  const libraryTitle = useLibraryTitle();

  // Auto-uncollapse: when the current URL points at a descendant of a
  // collapsed entry, clear that collapse flag so the active item
  // becomes visible in the sidebar. Persisted via the context's
  // localStorage effect — this is "uncollapse AND persist" semantics.
  useAutoUncollapse(channels, selectedChannelId);

  const { width, collapsed, mobileOpen, isMobile, toggleCollapsed, setMobileOpen } = useSidebar();

  // Collapsed desktop sidebar keeps scrolling but hides the bar —
  // a visible scrollbar inside a 56px rail looks noisy. The sheet
  // and expanded sidebar keep their default scrollbars.
  const renderSidebarContent = (hideScrollbar: boolean) => (
    <div
      className={`flex flex-1 flex-col overflow-x-hidden overflow-y-auto pb-6 ${
        hideScrollbar ? '[scrollbar-width:none] [&::-webkit-scrollbar]:hidden' : ''
      }`}
    >
      <ChannelSection
        channels={channels}
        selectedChannelId={selectedChannelId}
        totalUnread={totalUnread}
        onAddChannel={(folderId) => setAddChannelTarget({ folderId: folderId ?? null })}
        onAddVideo={(playlistId) => setAddVideoTarget({ playlistId: playlistId ?? null })}
      />
    </div>
  );

  return (
    <DashboardCtx.Provider value={dashboardValue}>
      <div className="flex h-full min-h-0">
        {/* Mobile sidebar drawer — always renders full (expanded) content
            regardless of the desktop collapse state. */}
        {isMobile && (
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetContent
              side="left"
              className="flex w-72 flex-col gap-0 p-0"
              aria-describedby={undefined}
            >
              <SidebarExpandedOverride>
                <div className="flex h-14 shrink-0 items-center border-b border-border px-5">
                  <SheetTitle className="text-base font-bold text-foreground">ReadTube</SheetTitle>
                </div>
                {renderSidebarContent(false)}
              </SidebarExpandedOverride>
            </SheetContent>
          </Sheet>
        )}

        {/* Desktop sidebar */}
        {!isMobile && (
          <aside
            className="relative flex shrink-0 flex-col border-r border-border bg-sidebar"
            style={{ width: collapsed ? 56 : width }}
          >
            <div className="flex h-14 shrink-0 items-center border-b border-border px-3">
              {collapsed ? (
                <button
                  type="button"
                  onClick={toggleCollapsed}
                  className="mx-auto rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                  aria-label="Expand sidebar"
                  title="Expand sidebar"
                >
                  <PanelLeft className="h-4 w-4" />
                </button>
              ) : (
                <div className="flex flex-1 items-center justify-between px-2">
                  <span className="text-base font-bold text-foreground">ReadTube</span>
                  <button
                    type="button"
                    onClick={toggleCollapsed}
                    className="rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                    aria-label="Collapse sidebar"
                    title="Collapse sidebar"
                  >
                    <PanelLeft className="h-4 w-4" />
                  </button>
                </div>
              )}
            </div>

            {renderSidebarContent(collapsed)}

            {/* Pinned bottom row: user profile on the left, theme selector on
                the right when expanded. When collapsed (56px rail) we stack the
                theme dropdown above the user button instead. */}
            <div
              className={`mt-auto shrink-0 border-t border-border ${
                collapsed
                  ? 'flex flex-col items-center gap-1.5 py-2'
                  : 'flex h-14 items-center justify-between px-4'
              }`}
            >
              {collapsed && <ThemeSelector side="right" />}
              <UserButton>
                <UserButton.MenuItems>
                  <UserButton.Link
                    label="Settings"
                    labelIcon={<AdjustmentsHorizontalIcon className="h-4 w-4" />}
                    href="/settings"
                  />
                </UserButton.MenuItems>
              </UserButton>
              {!collapsed && <ThemeSelector side="top" />}
            </div>

            {!collapsed && <SidebarResizeHandle />}
          </aside>
        )}

        {/* Main content */}
        <div className="flex min-w-0 flex-1 flex-col">
          {isMobile && (
            <MobileTopBar
              onOpenSidebar={() => setMobileOpen(true)}
              selectedChannel={selectedChannel}
              libraryTitle={libraryTitle}
              totalUnread={totalUnread}
            />
          )}
          {children}
        </div>

        <AddChannelModal
          isOpen={addChannelTarget != null}
          targetFolderId={addChannelTarget?.folderId ?? null}
          onClose={() => setAddChannelTarget(null)}
          onChannelAdded={handleChannelAdded}
        />
        <AddVideoModal
          open={addVideoTarget != null}
          targetPlaylistId={addVideoTarget?.playlistId ?? null}
          onOpenChange={(open) => {
            if (!open) {
              setAddVideoTarget(null);
            }
          }}
        />
        <Toaster />
      </div>
    </DashboardCtx.Provider>
  );
}

function MobileTopBar({
  onOpenSidebar,
  selectedChannel,
  libraryTitle,
  totalUnread,
}: {
  onOpenSidebar: () => void;
  selectedChannel: ChannelData | null;
  /** Title for library routes (All / Standalone / a specific playlist)
   *  when no channel is selected. */
  libraryTitle: string | null;
  totalUnread: number;
}) {
  const { mutate } = useSWRConfig();
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);
  const [marking, setMarking] = useState(false);
  const showRefresh = selectedChannel != null;
  const checkedAtDate =
    selectedChannel?.checkedAt != null ? new Date(selectedChannel.checkedAt) : null;
  const refreshAllowed = canManuallyRefresh(checkedAtDate);
  const refreshDisabled = refreshing || !refreshAllowed;
  const refreshTooltip = refreshAllowed
    ? 'Pull latest videos + metadata for this channel'
    : `Refreshed recently. Try again after ${MANUAL_REFRESH_DAYS} day${MANUAL_REFRESH_DAYS === 1 ? '' : 's'} since the last refresh.`;
  const unreadCount = selectedChannel != null ? selectedChannel.unreadCount : totalUnread;
  const showMarkAll = unreadCount > 0;

  async function handleRefreshChannel() {
    if (selectedChannel == null || refreshing || !refreshAllowed) {
      return;
    }
    setRefreshing(true);
    try {
      const res = await fetch(`/api/channels/${selectedChannel.id}/refresh`, { method: 'POST' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: 'Refresh failed' }));
        toast.error(body.error ?? 'Refresh failed');
        return;
      }
      const body = (await res.json()) as { videosProcessed: number };
      toast.success(`Refreshed: ${body.videosProcessed} videos processed`);
      await Promise.all([
        mutate('/api/channels'),
        mutate((key) => typeof key === 'string' && key.startsWith('/api/videos')),
      ]);
      router.refresh();
    } finally {
      setRefreshing(false);
    }
  }

  async function handleMarkAllRead() {
    if (marking) {
      return;
    }
    setMarking(true);
    try {
      const res = await fetch('/api/videos/mark-all-read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(selectedChannel != null ? { channelId: selectedChannel.id } : {}),
      });
      if (!res.ok) {
        return;
      }
      await Promise.all([
        mutate('/api/channels'),
        mutate((key) => typeof key === 'string' && key.startsWith('/api/videos')),
      ]);
    } finally {
      setMarking(false);
    }
  }

  return (
    <div className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-4">
      <button
        type="button"
        onClick={onOpenSidebar}
        className="shrink-0 rounded p-1.5 text-muted-foreground hover:bg-accent"
        aria-label="Open sidebar"
      >
        <Menu className="h-5 w-5" />
      </button>
      {selectedChannel == null && libraryTitle != null && (
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <span className="truncate text-base font-semibold text-foreground">{libraryTitle}</span>
        </div>
      )}
      {selectedChannel != null && (
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {selectedChannel.logoUrl != null && (
            <ChannelAvatar url={selectedChannel.logoUrl} size={40} cssSize="h-6 w-6" />
          )}
          <span className="truncate text-base font-semibold text-foreground">
            {selectedChannel.name}
          </span>
          {showRefresh && (
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                {/* Span wrapper keeps the tooltip hoverable while the
                    button is disabled — disabled buttons drop pointer
                    events that Radix needs for hover detection. */}
                <TooltipTrigger asChild>
                  <span className="inline-flex">
                    <button
                      type="button"
                      onClick={handleRefreshChannel}
                      disabled={refreshDisabled}
                      className="shrink-0 rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50 disabled:hover:bg-transparent"
                      aria-label="Refresh channel"
                    >
                      <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
                    </button>
                  </span>
                </TooltipTrigger>
                <TooltipContent side="bottom">{refreshTooltip}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
      )}
      <div className="ml-auto flex shrink-0 items-center gap-1">
        {showMarkAll && (
          <button
            type="button"
            onClick={handleMarkAllRead}
            disabled={marking}
            className="rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50 disabled:hover:bg-transparent"
            aria-label="Mark all as read"
            title="Mark all as read"
          >
            <CheckIcon className="h-5 w-5" />
          </button>
        )}
        <ThemeSelector />
        <UserButton>
          <UserButton.MenuItems>
            <UserButton.Link
              label="Settings"
              labelIcon={<AdjustmentsHorizontalIcon className="h-4 w-4" />}
              href="/settings"
            />
          </UserButton.MenuItems>
        </UserButton>
      </div>
    </div>
  );
}

/**
 * The authenticated reader at /videos/[videoId] runs a server-side
 * upsert into UserVideoConsumption on every page render. The sidebar's
 * unread caches (channels / playlists / library-counts) don't see that
 * write until the next focus event or manual reload, so the badges
 * lag behind reality — which is what the original "unread count
 * doesn't update without a refresh" bug was about. This effect fires
 * a single revalidation pass when the URL transitions onto a video
 * reader path. The sourceId narrowing avoids re-firing for sibling
 * paths (/videos, /videos/standalone, /videos/playlists/*) that
 * already keep their caches in sync via useTriage.
 */
function useReaderUnreadSync(revalidate: () => void) {
  const pathname = usePathname();
  const readerVideoId = useMemo(() => {
    if (pathname == null || !pathname.startsWith('/videos/')) {
      return null;
    }
    const rest = pathname.slice('/videos/'.length).split('/')[0];
    if (rest === 'standalone' || rest === 'playlists' || rest.length === 0) {
      return null;
    }
    return rest;
  }, [pathname]);

  useEffect(() => {
    if (readerVideoId == null) {
      return;
    }
    revalidate();
  }, [readerVideoId, revalidate]);
}

/**
 * Client-side slug→channel resolution so the sidebar knows which
 * channel row to highlight. Mirrors `resolveChannelSlug` (server) —
 * `@handle` (with or without the leading `@`) or a platform source_id.
 *
 * On `/videos/[videoId]`, falls back to the `returnTo` query param so
 * the sidebar keeps the origin channel highlighted while the reader
 * is open. We only resolve slugs that match a channel the user is
 * subscribed to (the `channels` array is exactly that set), which
 * preserves the server-side IDOR guard the old page performed.
 */
function useSelectedChannelId(channels: ChannelData[]): string | null {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  return useMemo(() => {
    if (pathname == null) {
      return null;
    }
    if (pathname.startsWith('/channels/')) {
      return resolveChannelSlugClient(channels, pathname.slice('/channels/'.length));
    }
    if (pathname.startsWith('/videos/')) {
      const returnTo = searchParams.get('returnTo');
      if (returnTo != null && returnTo.startsWith('/channels/')) {
        const afterPrefix = returnTo.slice('/channels/'.length);
        const slug = afterPrefix.split(/[/?#]/)[0];
        return resolveChannelSlugClient(channels, slug);
      }
    }
    return null;
  }, [pathname, searchParams, channels]);
}

function resolveChannelSlugClient(channels: ChannelData[], raw: string): string | null {
  const firstSegment = raw.split('/')[0];
  if (firstSegment.length === 0) {
    return null;
  }
  const decoded = decodeURIComponent(firstSegment);
  if (decoded.startsWith('@')) {
    const bare = decoded.slice(1);
    const match = channels.find(
      (c) => c.handle === decoded || c.handle === bare || c.handle === `@${bare}`
    );
    return match?.id ?? null;
  }
  const match = channels.find((c) => c.sourceId === decoded);
  return match?.id ?? null;
}

/**
 * Effect hook that inspects the current URL and clears any collapse
 * flag that would otherwise hide the active sidebar entry.
 */
function useAutoUncollapse(channels: ChannelData[], selectedChannelId: string | null) {
  const { ensureExpandedFor } = useCollapseState();
  const { folders } = useFolders();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Resolve the active view from the URL (Starred / Read Later /
  // Archived / Inbox / null). `resolveInboxView` returns null for
  // ad-hoc filter combinations, which we treat as "no sidebar view
  // is active" so we don't force-expand Views for every search.
  const nonDefaultView = useMemo(() => {
    const query = parseInboxQuery(extractInboxSearchParams(searchParams));
    const view = resolveInboxView(query);
    return view != null && view.key !== 'inbox';
  }, [searchParams]);

  const folderIdForSelection = useMemo(() => {
    if (selectedChannelId == null) {
      return null;
    }
    const channel = channels.find((c) => c.id === selectedChannelId);
    if (channel == null || channel.folderId == null) {
      return null;
    }
    // Guard against stale folder_id on a channel whose folder was
    // deleted in another tab — FolderSection treats these as root
    // anyway, so we shouldn't try to expand a non-existent folder.
    return folders.some((f) => f.id === channel.folderId) ? channel.folderId : null;
  }, [selectedChannelId, channels, folders]);

  // Match only the library sub-routes — not the reader at
  // /videos/[videoId], which is reachable from the inbox for
  // non-library videos and shouldn't auto-expand the Videos section.
  const videosSelected =
    pathname != null &&
    (pathname === '/videos' ||
      pathname === '/videos/standalone' ||
      pathname.startsWith('/videos/playlists/'));

  useEffect(() => {
    ensureExpandedFor({
      channelSelected: selectedChannelId != null,
      nonDefaultView,
      folderId: folderIdForSelection,
      videosSelected,
    });
  }, [
    ensureExpandedFor,
    selectedChannelId,
    nonDefaultView,
    folderIdForSelection,
    videosSelected,
    pathname,
  ]);
}

interface PlaylistSummary {
  id: string;
  name: string;
}

/**
 * Derives a display title for the mobile top bar on library and
 * video-reader routes. Returns null for non-library routes so the
 * channel/inbox title logic stays untouched.
 *
 * - /videos                         → "All videos"
 * - /videos/standalone              → "Standalone"
 * - /videos/playlists/[id]          → playlist name (from SWR cache)
 * - /videos/[sourceId] (the reader) → video title (via /api/videos/meta)
 */
function useLibraryTitle(): string | null {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { data: playlists = [] } = useSWR<PlaylistSummary[]>('/api/playlists', fetcher);

  const inboxViewLabel = useMemo(() => {
    if (pathname == null || pathname !== '/inbox') {
      return null;
    }
    const query = parseInboxQuery(extractInboxSearchParams(searchParams));
    return resolveInboxView(query)?.label ?? null;
  }, [pathname, searchParams]);

  // Video reader paths are /videos/<sourceId> where sourceId is the
  // 11-char YouTube id. Distinguish from the library routes which
  // have known literal segments (/videos, /videos/standalone,
  // /videos/playlists/*).
  const videoSourceId = useMemo(() => {
    if (pathname == null || !pathname.startsWith('/videos/')) {
      return null;
    }
    const rest = pathname.slice('/videos/'.length).split('/')[0];
    if (rest === 'standalone' || rest === 'playlists' || rest.length === 0) {
      return null;
    }
    return rest;
  }, [pathname]);

  const { data: videoMeta } = useSWR<{ title: string }>(
    videoSourceId != null ? `/api/videos/meta?sourceId=${encodeURIComponent(videoSourceId)}` : null,
    fetcher
  );

  return useMemo(() => {
    if (pathname == null) {
      return null;
    }
    if (pathname === '/videos') {
      return 'All videos';
    }
    if (pathname === '/videos/standalone') {
      return 'Standalone';
    }
    if (pathname.startsWith('/videos/playlists/')) {
      const id = pathname.slice('/videos/playlists/'.length).split('/')[0];
      const pl = playlists.find((p) => p.id === id);
      return pl?.name ?? 'Playlist';
    }
    if (videoSourceId != null) {
      return videoMeta?.title ?? null;
    }
    if (inboxViewLabel != null) {
      return inboxViewLabel;
    }
    return null;
  }, [pathname, playlists, videoSourceId, videoMeta, inboxViewLabel]);
}
