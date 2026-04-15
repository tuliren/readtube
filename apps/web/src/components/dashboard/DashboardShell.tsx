'use client';

import { UserButton } from '@clerk/nextjs';
import { Menu, PanelLeft } from 'lucide-react';
import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';

import AddChannelModal from '@/components/inbox/AddChannelModal';
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
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { Toaster } from '@/components/ui/sonner';
import { extractInboxSearchParams, parseInboxQuery } from '@/lib/inbox/filter';
import { resolveInboxView } from '@/lib/inbox/views';
import type { ChannelData } from '@/lib/types';

import { CollapseStateProvider, useCollapseState } from './CollapseStateContext';
import { DashboardCtx, type DashboardState } from './DashboardContext';

const fetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) {
      throw new Error(`Fetch error: ${r.status}`);
    }
    return r.json();
  });

interface Props {
  initialChannels: ChannelData[];
  children: React.ReactNode;
}

export default function DashboardShell({ initialChannels, children }: Props) {
  return (
    <SidebarProvider>
      <KeyboardShortcutsProvider>
        <CommandPaletteProvider>
          <CollapseStateProvider>
            <DashboardShellInner initialChannels={initialChannels}>{children}</DashboardShellInner>
          </CollapseStateProvider>
        </CommandPaletteProvider>
      </KeyboardShortcutsProvider>
    </SidebarProvider>
  );
}

function DashboardShellInner({ initialChannels, children }: Props) {
  const [modalOpen, setModalOpen] = useState(false);
  const { data: channels = initialChannels, mutate: mutateChannels } = useSWR<ChannelData[]>(
    '/api/channels',
    fetcher,
    { fallbackData: initialChannels }
  );

  const totalUnread = channels.reduce((sum, c) => sum + c.unreadCount, 0);

  function handleChannelAdded(channel: ChannelData) {
    void mutateChannels([...channels, channel].sort((a, b) => a.name.localeCompare(b.name)));
  }

  const dashboardValue = useMemo<DashboardState>(
    () => ({
      channels,
      totalUnread,
      openAddChannel: () => setModalOpen(true),
      mutateChannels,
    }),
    [channels, totalUnread, mutateChannels]
  );

  const selectedChannelId = useSelectedChannelId(channels);

  // Auto-uncollapse: when the current URL points at a descendant of a
  // collapsed entry, clear that collapse flag so the active item
  // becomes visible in the sidebar. Persisted via the context's
  // localStorage effect — this is "uncollapse AND persist" semantics.
  useAutoUncollapse(channels, selectedChannelId);

  const { width, collapsed, mobileOpen, isMobile, toggleCollapsed, setMobileOpen } = useSidebar();

  const sidebarContent = (
    <div className="flex flex-1 flex-col overflow-y-auto pb-6">
      <ChannelSection
        channels={channels}
        selectedChannelId={selectedChannelId}
        totalUnread={totalUnread}
        onAddChannel={() => setModalOpen(true)}
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
            <SheetContent side="left" className="w-72 p-0" aria-describedby={undefined}>
              <SidebarExpandedOverride>
                <div className="flex h-14 shrink-0 items-center border-b border-gray-200 px-5">
                  <SheetTitle className="text-base font-bold text-gray-900">ReadTube</SheetTitle>
                </div>
                {sidebarContent}
              </SidebarExpandedOverride>
            </SheetContent>
          </Sheet>
        )}

        {/* Desktop sidebar */}
        {!isMobile && (
          <aside
            className="relative flex shrink-0 flex-col border-r border-gray-200 bg-gray-50"
            style={{ width: collapsed ? 56 : width }}
          >
            <div className="flex h-14 shrink-0 items-center border-b border-gray-200 px-3">
              {collapsed ? (
                <button
                  type="button"
                  onClick={toggleCollapsed}
                  className="mx-auto rounded p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                  aria-label="Expand sidebar"
                  title="Expand sidebar"
                >
                  <PanelLeft className="h-4 w-4" />
                </button>
              ) : (
                <div className="flex flex-1 items-center justify-between px-2">
                  <span className="text-base font-bold text-gray-900">ReadTube</span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={toggleCollapsed}
                      className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                      aria-label="Collapse sidebar"
                      title="Collapse sidebar"
                    >
                      <PanelLeft className="h-4 w-4" />
                    </button>
                    <UserButton />
                  </div>
                </div>
              )}
            </div>

            {sidebarContent}
            {!collapsed && <SidebarResizeHandle />}
          </aside>
        )}

        {/* Main content */}
        <div className="flex min-w-0 flex-1 flex-col">
          {isMobile && (
            <div className="flex h-14 shrink-0 items-center gap-3 border-b border-gray-200 px-4">
              <button
                type="button"
                onClick={() => setMobileOpen(true)}
                className="rounded p-1.5 text-gray-500 hover:bg-gray-100"
                aria-label="Open sidebar"
              >
                <Menu className="h-5 w-5" />
              </button>
              <span className="text-base font-bold text-gray-900">ReadTube</span>
              <div className="ml-auto">
                <UserButton />
              </div>
            </div>
          )}
          {children}
        </div>

        <AddChannelModal
          isOpen={modalOpen}
          onClose={() => setModalOpen(false)}
          onChannelAdded={handleChannelAdded}
        />
        <Toaster />
      </div>
    </DashboardCtx.Provider>
  );
}

/**
 * Client-side slug→channel resolution so the sidebar knows which
 * channel row to highlight. Mirrors `resolveChannelSlug` (server) —
 * `@handle` (with or without the leading `@`) or a platform source_id.
 */
function useSelectedChannelId(channels: ChannelData[]): string | null {
  const pathname = usePathname();
  return useMemo(() => {
    if (pathname == null || !pathname.startsWith('/channels/')) {
      return null;
    }
    const raw = pathname.slice('/channels/'.length).split('/')[0];
    if (raw.length === 0) {
      return null;
    }
    const decoded = decodeURIComponent(raw);
    if (decoded.startsWith('@')) {
      const bare = decoded.slice(1);
      const match = channels.find(
        (c) => c.handle === decoded || c.handle === bare || c.handle === `@${bare}`
      );
      return match?.id ?? null;
    }
    const match = channels.find((c) => c.sourceId === decoded);
    return match?.id ?? null;
  }, [pathname, channels]);
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

  useEffect(() => {
    ensureExpandedFor({
      channelSelected: selectedChannelId != null,
      nonDefaultView,
      folderId: folderIdForSelection,
    });
  }, [ensureExpandedFor, selectedChannelId, nonDefaultView, folderIdForSelection, pathname]);
}
