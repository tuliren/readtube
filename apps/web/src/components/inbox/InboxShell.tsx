'use client';

import { UserButton } from '@clerk/nextjs';
import { Menu, PanelLeft } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';

import NotesPanelResponsive from '@/components/NotesPanelResponsive';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { Toaster } from '@/components/ui/sonner';
import {
  PAGE_SIZE,
  encodeInboxQuery,
  extractInboxSearchParams,
  parseInboxQuery,
} from '@/lib/inbox/filter';
import type { InboxVideosResult } from '@/lib/inbox/loadVideos';
import { resolveInboxView } from '@/lib/inbox/views';
import type { ChannelData, VideoData } from '@/lib/types';

import AddChannelModal from './AddChannelModal';
import ChannelSection from './ChannelSection';
import { CommandPaletteProvider } from './CommandPalette';
import InboxHeader from './InboxHeader';
import { KeyboardShortcutsProvider } from './KeyboardShortcutsProvider';
import {
  SidebarExpandedOverride,
  SidebarProvider,
  SidebarResizeHandle,
  useSidebar,
} from './SidebarContext';
import VideoList from './VideoList';

const fetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) {
      throw new Error(`Fetch error: ${r.status}`);
    }
    return r.json();
  });

interface Props {
  initialChannels: ChannelData[];
  initialVideos: VideoData[];
  /** Total matching videos across all pages, computed by the SSR
   *  loadInboxVideos call. Used as the SWR fallback so the header
   *  can render Page X of N immediately without waiting for the
   *  client fetch. */
  initialTotal: number;
  selectedChannelId: string | null;
  selectedVideoId: string | null;
  children?: React.ReactNode;
}

export default function InboxShell({
  initialChannels,
  initialVideos,
  initialTotal,
  selectedChannelId,
  selectedVideoId,
  children,
}: Props) {
  const [modalOpen, setModalOpen] = useState(false);
  const searchParams = useSearchParams();

  const channelsUrl = '/api/channels';
  // Build the videos fetch URL from the full InboxQuery (including filter
  // chips, search text, saved views). We round-trip through the canonical
  // codec so the client request matches what the server parses.
  // extractInboxSearchParams unwraps the `from` indirection used by the
  // reader so the sidebar list reflects the same filter the user came
  // from when they opened the video.
  const videosUrl = useMemo(() => {
    const query = parseInboxQuery(extractInboxSearchParams(searchParams));
    if (query.channelId == null && selectedChannelId != null) {
      query.channelId = selectedChannelId;
    }
    const params = encodeInboxQuery(query);
    const qs = params.toString();
    return qs.length > 0 ? `/api/videos?${qs}` : '/api/videos';
  }, [searchParams, selectedChannelId]);

  const { data: channels = initialChannels, mutate: mutateChannels } = useSWR<ChannelData[]>(
    channelsUrl,
    fetcher,
    { fallbackData: initialChannels }
  );

  // Capture the videosUrl that matched server-side rendering on mount.
  // We can only safely fall back to the SSR payload for that exact
  // key — otherwise SWR would hand the SSR-rendered list (and total)
  // back as the "fallback" for any new key (every filter chip toggle,
  // search edit, saved view click, page change) and the user would
  // briefly see the old, wrong list flash before the correct fetch
  // resolves. Pre-PR this only fired on channel switch; the filter
  // system makes the videosUrl change on nearly every interaction.
  const [ssrVideosUrl] = useState(videosUrl);
  const videosFallback: InboxVideosResult | undefined =
    videosUrl === ssrVideosUrl
      ? {
          videos: initialVideos,
          total: initialTotal,
          page: Math.max(1, parseInboxQuery(extractInboxSearchParams(searchParams)).page ?? 1),
          pageSize: PAGE_SIZE,
        }
      : undefined;

  // No destructuring default — we explicitly want `data` to be
  // undefined while a non-SSR key is loading so the consumer can
  // render a loading skeleton instead of an empty-state message
  // (which would otherwise flash for ~100ms on every filter change).
  // We deliberately do NOT pass keepPreviousData, because the
  // previous key's data would be just as wrong as the SSR fallback
  // for the user's freshly-toggled filter (e.g., toggling Starred
  // would show the old unfiltered list briefly).
  const { data: videosData } = useSWR<InboxVideosResult>(videosUrl, fetcher, {
    fallbackData: videosFallback,
  });
  // `isLoading` reflects "we have no data to show yet" — i.e. the
  // SWR cache has nothing for this key AND no SSR fallback applied.
  // `videosData === undefined` is the right signal because the SSR
  // fallback path resolves synchronously, so any undefined value
  // means we're actively waiting on a fetch.
  const isLoadingVideos = videosData === undefined;
  const videoList = videosData?.videos ?? [];
  const totalVideos = videosData?.total ?? 0;

  const totalUnread = channels.reduce((sum, c) => sum + c.unreadCount, 0);

  function handleChannelAdded(channel: ChannelData) {
    void mutateChannels([...channels, channel].sort((a, b) => a.name.localeCompare(b.name)));
  }

  const showEmptyState = channels.length === 0;

  // Resolve the active view from the URL so the header label and the
  // empty-state copy can change with the filter the user is in.
  // Channel selection still wins over the named buckets — if a user
  // is narrowing to a single channel within Starred, the header
  // shows the channel name, not "Starred".
  const inboxQuery = useMemo(
    () => parseInboxQuery(extractInboxSearchParams(searchParams)),
    [searchParams]
  );
  const activeView = useMemo(() => resolveInboxView(inboxQuery), [inboxQuery]);

  const selectedChannel =
    selectedChannelId != null ? (channels.find((c) => c.id === selectedChannelId) ?? null) : null;
  const headerName =
    selectedChannel != null ? selectedChannel.name : (activeView?.label ?? 'Inbox');
  const headerLogoUrl = selectedChannel?.logoUrl ?? null;
  const headerUnread = selectedChannel != null ? selectedChannel.unreadCount : totalUnread;
  // Empty-state copy follows the same precedence: a channel narrow
  // gets a channel-specific message; otherwise the active named view
  // owns the copy; otherwise (free-text search, tags, etc.) we fall
  // back to a generic "no matches" line.
  const emptyMessage =
    selectedChannel != null
      ? `No videos in ${selectedChannel.name} yet.`
      : (activeView?.emptyMessage ?? 'No videos match the current filters.');

  return (
    <SidebarProvider>
      <KeyboardShortcutsProvider>
        <CommandPaletteProvider>
          <InboxShellInner
            channels={channels}
            videos={videoList}
            totalVideos={totalVideos}
            isLoadingVideos={isLoadingVideos}
            selectedChannelId={selectedChannelId}
            selectedVideoId={selectedVideoId}
            totalUnread={totalUnread}
            headerName={headerName}
            headerLogoUrl={headerLogoUrl}
            headerUnread={headerUnread}
            emptyMessage={emptyMessage}
            showEmptyState={showEmptyState}
            modalOpen={modalOpen}
            setModalOpen={setModalOpen}
            handleChannelAdded={handleChannelAdded}
          >
            {children}
          </InboxShellInner>
        </CommandPaletteProvider>
      </KeyboardShortcutsProvider>
    </SidebarProvider>
  );
}

interface InnerProps {
  channels: ChannelData[];
  videos: VideoData[];
  totalVideos: number;
  isLoadingVideos: boolean;
  selectedChannelId: string | null;
  selectedVideoId: string | null;
  totalUnread: number;
  headerName: string;
  headerLogoUrl: string | null;
  headerUnread: number;
  emptyMessage: string;
  showEmptyState: boolean;
  modalOpen: boolean;
  setModalOpen: (open: boolean) => void;
  handleChannelAdded: (channel: ChannelData) => void;
  children?: React.ReactNode;
}

function InboxShellInner({
  channels,
  videos,
  totalVideos,
  isLoadingVideos,
  selectedChannelId,
  selectedVideoId,
  totalUnread,
  headerName,
  headerLogoUrl,
  headerUnread,
  emptyMessage,
  showEmptyState,
  modalOpen,
  setModalOpen,
  handleChannelAdded,
  children,
}: InnerProps) {
  const [notesVideo, setNotesVideo] = useState<{ id: string; title: string } | null>(null);

  // Close the notes panel when the video list changes (channel switch,
  // filter toggle) and the video whose notes are open is no longer visible.
  useEffect(() => {
    if (notesVideo == null) {
      return;
    }
    const stillVisible = videos.some((v) => v.id === notesVideo.id);
    if (!stillVisible) {
      setNotesVideo(null);
    }
  }, [videos, notesVideo]);

  function handleOpenNotes(videoId: string, videoTitle: string) {
    // Toggle: clicking the same video's notes button closes the panel
    if (notesVideo?.id === videoId) {
      setNotesVideo(null);
    } else {
      setNotesVideo({ id: videoId, title: videoTitle });
    }
  }

  const { width, collapsed, mobileOpen, isMobile, toggleCollapsed, setMobileOpen } = useSidebar();

  const sidebarContent = (
    <>
      <div className="flex flex-1 flex-col overflow-y-auto pb-6">
        <ChannelSection
          channels={channels}
          selectedChannelId={selectedChannelId}
          totalUnread={totalUnread}
          onAddChannel={() => setModalOpen(true)}
        />
      </div>
    </>
  );

  return (
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
          {/* Logo / topbar */}
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
        {/* Mobile header with menu button */}
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
        {children ? (
          // Reader mode: show the selected video
          <div className="flex flex-1 overflow-hidden">{children}</div>
        ) : showEmptyState ? (
          // Empty state: no channels
          <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
            <div>
              <p className="text-lg font-semibold text-gray-700">No channels yet</p>
              <p className="mt-1 text-sm text-gray-500">Add a YouTube channel to get started.</p>
              <p className="mt-1 text-xs text-gray-500">
                Supported:{' '}
                <code className="rounded bg-gray-100 px-1">youtube.com/channel/UCxxxxx</code> or{' '}
                <code className="rounded bg-gray-100 px-1">UCxxxxx</code>
              </p>
            </div>
            <button
              onClick={() => setModalOpen(true)}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              Add your first channel
            </button>
          </div>
        ) : (
          // List mode: show video list with a header toolbar
          <div className="flex flex-1 overflow-hidden">
            <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
              <InboxHeader
                channelId={selectedChannelId}
                channelName={headerName}
                channelLogoUrl={headerLogoUrl}
                unreadCount={headerUnread}
                totalVideos={totalVideos}
              />
              <div className="flex-1 overflow-y-auto">
                <VideoList
                  videos={videos}
                  selectedVideoId={selectedVideoId}
                  emptyMessage={emptyMessage}
                  isLoading={isLoadingVideos}
                  onOpenNotes={handleOpenNotes}
                />
              </div>
            </div>
            {notesVideo != null && (
              <NotesPanelResponsive
                key={notesVideo.id}
                videoId={notesVideo.id}
                subtitle={notesVideo.title}
                isMobile={isMobile}
                onClose={() => setNotesVideo(null)}
              />
            )}
          </div>
        )}
      </div>

      <AddChannelModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onChannelAdded={handleChannelAdded}
      />
      <Toaster />
    </div>
  );
}
