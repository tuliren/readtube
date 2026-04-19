'use client';

import { useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';

import NotesPanelResponsive from '@/components/NotesPanelResponsive';
import { useDashboard } from '@/components/dashboard/DashboardContext';
import {
  PAGE_SIZE,
  encodeInboxQuery,
  extractInboxSearchParams,
  parseInboxQuery,
} from '@/lib/inbox/filter';
import type { InboxVideosResult } from '@/lib/inbox/loadVideos';
import { resolveInboxView } from '@/lib/inbox/views';
import type { VideoData } from '@/lib/types';

import InboxHeader from './InboxHeader';
import { useSidebar } from './SidebarContext';
import VideoList from './VideoList';

const fetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) {
      throw new Error(`Fetch error: ${r.status}`);
    }
    return r.json();
  });

interface Props {
  initialVideos: VideoData[];
  /** Total matching videos across all pages, computed by the SSR
   *  `loadInboxVideos` call. Used as the SWR fallback so the header
   *  can render Page X of N immediately without waiting for the
   *  client fetch. */
  initialTotal: number;
  selectedChannelId: string | null;
  selectedVideoId: string | null;
}

/**
 * Main content for /inbox and /channels/[slug]: the filter/paginate
 * header, the paginated video list, and the per-video notes drawer.
 * Reads `channels` from the dashboard context so the header can
 * render the active channel's name/logo/unread count without
 * duplicating the channels SWR subscription.
 */
export default function InboxListView({
  initialVideos,
  initialTotal,
  selectedChannelId,
  selectedVideoId,
}: Props) {
  const { channels, totalUnread, openAddChannel } = useDashboard();
  const searchParams = useSearchParams();

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

  // Capture the videosUrl that matched server-side rendering on mount.
  // We can only safely fall back to the SSR payload for that exact
  // key — otherwise SWR would hand the SSR-rendered list (and total)
  // back as the "fallback" for any new key (every filter chip toggle,
  // search edit, saved view click, page change) and the user would
  // briefly see the old, wrong list flash before the correct fetch
  // resolves.
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
  const { data: videosData } = useSWR<InboxVideosResult>(videosUrl, fetcher, {
    fallbackData: videosFallback,
  });
  const isLoadingVideos = videosData === undefined;
  // Memoize so the videoList identity is stable across renders that
  // don't change `videosData` — otherwise the notes-panel effect
  // below re-fires every render and can thrash.
  const videoList = useMemo(() => videosData?.videos ?? [], [videosData]);
  const totalVideos = videosData?.total ?? 0;

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
  const emptyMessage =
    selectedChannel != null
      ? `No videos in ${selectedChannel.name} yet.`
      : (activeView?.emptyMessage ?? 'No videos match the current filters.');

  const showEmptyState = channels.length === 0;

  const { isMobile } = useSidebar();
  const [notesVideo, setNotesVideo] = useState<{ id: string; title: string } | null>(null);

  // Close the notes panel when the video list changes (channel switch,
  // filter toggle) and the video whose notes are open is no longer visible.
  useEffect(() => {
    if (notesVideo == null) {
      return;
    }
    const stillVisible = videoList.some((v) => v.id === notesVideo.id);
    if (!stillVisible) {
      setNotesVideo(null);
    }
  }, [videoList, notesVideo]);

  function handleOpenNotes(videoId: string, videoTitle: string) {
    // Toggle: clicking the same video's notes button closes the panel
    if (notesVideo?.id === videoId) {
      setNotesVideo(null);
    } else {
      setNotesVideo({ id: videoId, title: videoTitle });
    }
  }

  if (showEmptyState) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
        <div>
          <p className="text-lg font-semibold text-gray-700">No channels yet</p>
          <p className="mt-1 text-sm text-gray-500">Add a YouTube channel to get started.</p>
          <p className="mt-1 text-xs text-gray-500">
            Supported: <code className="rounded bg-gray-100 px-1">youtube.com/channel/UCxxxxx</code>{' '}
            or <code className="rounded bg-gray-100 px-1">UCxxxxx</code>
          </p>
        </div>
        <button
          onClick={openAddChannel}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          Add your first channel
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-1 overflow-hidden">
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <InboxHeader
          channelId={selectedChannelId}
          channelSourceId={selectedChannel?.sourceId ?? null}
          channelPlatform={selectedChannel?.platform ?? null}
          channelName={headerName}
          channelLogoUrl={headerLogoUrl}
          unreadCount={headerUnread}
          totalVideos={totalVideos}
        />
        <div className="flex-1 overflow-y-auto">
          <VideoList
            videos={videoList}
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
  );
}
