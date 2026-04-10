'use client';

import { UserButton } from '@clerk/nextjs';
import { useState } from 'react';
import useSWR from 'swr';

import type { ChannelData, VideoData } from '@/lib/types';

import AddChannelModal from './AddChannelModal';
import ChannelSection from './ChannelSection';
import InboxHeader from './InboxHeader';
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

  const channelsUrl = '/api/channels';
  const videosUrl = selectedChannelId
    ? `/api/videos?channelId=${selectedChannelId}`
    : '/api/videos';

  const { data: channels = initialChannels, mutate: mutateChannels } = useSWR<ChannelData[]>(
    channelsUrl,
    fetcher,
    { fallbackData: initialChannels }
  );

  const { data: videos = initialVideos } = useSWR<VideoData[]>(videosUrl, fetcher, {
    fallbackData: initialVideos,
  });

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
              <p className="mt-1 text-sm text-gray-400">Add a YouTube channel to get started.</p>
              <p className="mt-1 text-xs text-gray-400">
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
    </div>
  );
}
