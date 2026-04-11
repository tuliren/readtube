'use client';

import { UserButton } from '@clerk/nextjs';
import { useSearchParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import useSWR from 'swr';

import { Toaster } from '@/components/ui/sonner';
import { encodeInboxQuery, parseInboxQuery } from '@/lib/inbox/filter';
import type { ChannelData, VideoData } from '@/lib/types';

import AddChannelModal from './AddChannelModal';
import ChannelSection from './ChannelSection';
import { CommandPaletteProvider } from './CommandPalette';
import InboxHeader from './InboxHeader';
import { KeyboardShortcutsProvider } from './KeyboardShortcutsProvider';
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
  selectedChannelId: string | null;
  selectedVideoId: string | null;
  children?: React.ReactNode;
}

export default function InboxShell({
  initialChannels,
  initialVideos,
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
  const videosUrl = useMemo(() => {
    const query = parseInboxQuery(searchParams);
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
  // We can only safely fall back to `initialVideos` for that exact key —
  // otherwise SWR will hand the SSR-rendered list back as the "fallback"
  // for any new key (every filter chip toggle, search edit, saved view
  // click) and the user briefly sees the old, wrong list flash before
  // the correct fetch resolves. Pre-PR this only fired on channel
  // switch; the filter system makes the videosUrl change on nearly
  // every interaction.
  const [ssrVideosUrl] = useState(videosUrl);
  const videosFallback = videosUrl === ssrVideosUrl ? initialVideos : undefined;

  // No destructuring default — we explicitly want `videos` to be
  // undefined while a non-SSR key is loading so the consumer can
  // render an empty placeholder instead of stale wrong content. We
  // deliberately do NOT pass keepPreviousData, because the previous
  // key's data would be just as wrong as the SSR fallback for the
  // user's freshly-toggled filter (e.g., toggling Starred would show
  // the old unfiltered list briefly, which is exactly the regression
  // this fix is closing).
  const { data: videos } = useSWR<VideoData[]>(videosUrl, fetcher, {
    fallbackData: videosFallback,
  });
  const videoList = videos ?? [];

  const totalUnread = channels.reduce((sum, c) => sum + c.unreadCount, 0);

  function handleChannelAdded(channel: ChannelData) {
    void mutateChannels([...channels, channel].sort((a, b) => a.name.localeCompare(b.name)));
  }

  const showEmptyState = channels.length === 0;

  const selectedChannel =
    selectedChannelId != null ? (channels.find((c) => c.id === selectedChannelId) ?? null) : null;
  const headerName = selectedChannel != null ? selectedChannel.name : 'All unread';
  const headerUnread = selectedChannel != null ? selectedChannel.unreadCount : totalUnread;

  return (
    <KeyboardShortcutsProvider>
      <CommandPaletteProvider>
        <InboxShellInner
          channels={channels}
          videos={videoList}
          selectedChannelId={selectedChannelId}
          selectedVideoId={selectedVideoId}
          totalUnread={totalUnread}
          headerName={headerName}
          headerUnread={headerUnread}
          showEmptyState={showEmptyState}
          modalOpen={modalOpen}
          setModalOpen={setModalOpen}
          handleChannelAdded={handleChannelAdded}
        >
          {children}
        </InboxShellInner>
      </CommandPaletteProvider>
    </KeyboardShortcutsProvider>
  );
}

interface InnerProps {
  channels: ChannelData[];
  videos: VideoData[];
  selectedChannelId: string | null;
  selectedVideoId: string | null;
  totalUnread: number;
  headerName: string;
  headerUnread: number;
  showEmptyState: boolean;
  modalOpen: boolean;
  setModalOpen: (open: boolean) => void;
  handleChannelAdded: (channel: ChannelData) => void;
  children?: React.ReactNode;
}

function InboxShellInner({
  channels,
  videos,
  selectedChannelId,
  selectedVideoId,
  totalUnread,
  headerName,
  headerUnread,
  showEmptyState,
  modalOpen,
  setModalOpen,
  handleChannelAdded,
  children,
}: InnerProps) {
  return (
    <div className="flex h-full min-h-0">
      {/* Sidebar */}
      <aside className="flex w-72 shrink-0 flex-col border-r border-gray-200 bg-gray-50">
        {/* Logo / topbar */}
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-gray-200 px-5">
          <span className="text-base font-bold text-gray-900">ReadTube</span>
          <UserButton />
        </div>

        <div className="flex flex-1 flex-col overflow-y-auto">
          <ChannelSection
            channels={channels}
            selectedChannelId={selectedChannelId}
            totalUnread={totalUnread}
            onAddChannel={() => setModalOpen(true)}
          />
        </div>
      </aside>

      {/* Main content */}
      <div className="flex min-w-0 flex-1 flex-col">
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
          <div className="flex flex-1 flex-col overflow-hidden">
            <InboxHeader
              channelId={selectedChannelId}
              channelName={headerName}
              unreadCount={headerUnread}
            />
            <div className="flex-1 overflow-y-auto">
              <VideoList videos={videos} selectedVideoId={selectedVideoId} />
            </div>
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
