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
import type { InboxQuery, VideoData, VideoPlatform } from '@/lib/types';

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

/**
 * Overrides for the library variants. When provided, the component
 * skips the inbox-specific channel/active-view lookup and treats the
 * scope as static — library pages compute their own title, logo,
 * mark-all-read body, etc. from the URL/playlistId they own.
 */
interface LibraryOverrides {
  /** Merged into the parsed InboxQuery when building the SWR key so
   *  the library scope makes it into /api/videos?library=…. */
  scope: Partial<InboxQuery>;
  /** Header title (replaces the channel name / active-view label). */
  title: string;
  /** Empty-state copy (replaces the active-view default). */
  emptyMessage: string;
  /** Body for POST /api/videos/mark-all-read. */
  markAllReadBody: Record<string, unknown>;
  /** Optional trailing content next to the title (e.g. YouTube link). */
  trailing?: React.ReactNode;
}

// Minimal shape of /api/videos/library-counts — we only need the
// standalone total to drive the Mark-all-read button here.
interface LibraryCounts {
  standaloneUnread: number;
}

// Minimal shape of /api/playlists — same data the sidebar consumes,
// so SWR usually serves the sibling hook's cache.
interface PlaylistSummary {
  id: string;
  unreadCount: number;
}

interface Props {
  initialVideos: VideoData[];
  /** Total matching videos across all pages, computed by the SSR
   *  loader. Used as the SWR fallback so the header can render
   *  Page X of N immediately without waiting for the client fetch. */
  initialTotal: number;
  selectedChannelId: string | null;
  selectedVideoId: string | null;
  /** Opt into the library variant. When set, the component uses the
   *  override title / empty message / mark-all-read body, merges the
   *  scope into the SWR URL, and hides the search input. */
  library?: LibraryOverrides;
  /** Surface library-specific actions (Remove from library) in per-row
   *  icons and the bulk action bar. Enabled from library pages. */
  showRemoveFromLibrary?: boolean;
}

/**
 * Main content for the list routes: inbox (/inbox), channel
 * (/channels/[slug]), and library (/videos/standalone,
 * /videos/playlists/[id]). The common flow — SSR payload, SWR
 * revalidation against `/api/videos`, header + pagination, notes
 * drawer — is shared; the library variant injects a static scope
 * (library=standalone or library=playlist&playlistId=…) and overrides
 * the title, empty-state copy, and mark-all-read body.
 *
 * Reads `channels` from the dashboard context so the header can
 * render the active channel's name/logo/unread count without
 * duplicating the channels SWR subscription.
 */
export default function VideoListView({
  initialVideos,
  initialTotal,
  selectedChannelId,
  selectedVideoId,
  library,
  showRemoveFromLibrary,
}: Props) {
  const { channels, totalUnread, openAddChannel } = useDashboard();
  const searchParams = useSearchParams();

  // Build the videos fetch URL from the full InboxQuery (including filter
  // chips, search text, saved views). We round-trip through the canonical
  // codec so the client request matches what the server parses.
  // extractInboxSearchParams unwraps the `from` indirection used by the
  // reader so the sidebar list reflects the same filter the user came
  // from when they opened the video. Library pages merge their scope
  // (`library`, `playlistId`) into the parsed query so `/api/videos`
  // hits the library branch of `loadInboxVideos`.
  const videosUrl = useMemo(() => {
    const query = parseInboxQuery(extractInboxSearchParams(searchParams));
    if (library != null) {
      Object.assign(query, library.scope);
    } else if (query.channelId == null && selectedChannelId != null) {
      query.channelId = selectedChannelId;
    }
    const params = encodeInboxQuery(query);
    const qs = params.toString();
    return qs.length > 0 ? `/api/videos?${qs}` : '/api/videos';
  }, [searchParams, selectedChannelId, library]);

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

  // Library unread counts. Fetched from the same endpoints the sidebar
  // uses, so SWR's cache usually serves them instantly. The standalone
  // total comes from /api/videos/library-counts; per-playlist counts
  // are attached to each /api/playlists row (same shape VideosSection
  // consumes). Both endpoints are invalidated by useTriage, so the
  // mark-all-read button appears and disappears in sync with the row
  // states.
  const libraryKind = library?.scope.library ?? null;
  const libraryPlaylistId = library?.scope.playlistId ?? null;
  const { data: libraryCounts } = useSWR<LibraryCounts>(
    libraryKind === 'standalone' ? '/api/videos/library-counts' : null,
    fetcher
  );
  const { data: playlistSummaries } = useSWR<PlaylistSummary[]>(
    libraryKind === 'playlist' ? '/api/playlists' : null,
    fetcher
  );
  const libraryUnread = (() => {
    if (library == null) {
      return 0;
    }
    if (libraryKind === 'standalone') {
      return libraryCounts?.standaloneUnread ?? 0;
    }
    if (libraryKind === 'playlist' && libraryPlaylistId != null) {
      return playlistSummaries?.find((p) => p.id === libraryPlaylistId)?.unreadCount ?? 0;
    }
    return 0;
  })();

  // Resolve the active view from the URL so the header label and the
  // empty-state copy can change with the filter the user is in. Skip
  // for library views — they have static overrides.
  const inboxQuery = useMemo(
    () => parseInboxQuery(extractInboxSearchParams(searchParams)),
    [searchParams]
  );
  const activeView = useMemo(() => resolveInboxView(inboxQuery), [inboxQuery]);

  const selectedChannel =
    selectedChannelId != null ? (channels.find((c) => c.id === selectedChannelId) ?? null) : null;

  let headerName: string;
  let headerLogoUrl: string | null;
  let headerUnread: number;
  let emptyMessage: string;
  let headerChannelId: string | null;
  let headerChannelSourceId: string | null;
  let headerChannelPlatform: VideoPlatform | null;
  let headerMarkAllReadBody: Record<string, unknown> | undefined;
  let headerTrailing: React.ReactNode | undefined;

  if (library != null) {
    headerName = library.title;
    headerLogoUrl = null;
    headerUnread = libraryUnread;
    emptyMessage = library.emptyMessage;
    headerChannelId = null;
    headerChannelSourceId = null;
    headerChannelPlatform = null;
    headerMarkAllReadBody = library.markAllReadBody;
    headerTrailing = library.trailing;
  } else {
    headerName = selectedChannel != null ? selectedChannel.name : (activeView?.label ?? 'Inbox');
    headerLogoUrl = selectedChannel?.logoUrl ?? null;
    headerUnread = selectedChannel != null ? selectedChannel.unreadCount : totalUnread;
    emptyMessage =
      selectedChannel != null
        ? `No videos in ${selectedChannel.name} yet.`
        : (activeView?.emptyMessage ?? 'No videos match the current filters.');
    headerChannelId = selectedChannelId;
    headerChannelSourceId = selectedChannel?.sourceId ?? null;
    headerChannelPlatform = selectedChannel?.platform ?? null;
    headerMarkAllReadBody = undefined;
    headerTrailing = undefined;
  }

  // Inbox-only first-run empty state. Library routes skip this branch —
  // a user with zero channels can still be curating standalone videos
  // and playlists, so the list (and its own empty-copy) is the right
  // surface there.
  const showNoChannelsCta = library == null && channels.length === 0;

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

  if (showNoChannelsCta) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
        <div>
          <p className="text-lg font-semibold text-foreground">No channels yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Add a YouTube channel to get started.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Supported: <code className="rounded bg-muted px-1">youtube.com/channel/UCxxxxx</code> or{' '}
            <code className="rounded bg-muted px-1">UCxxxxx</code>
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
          channelId={headerChannelId}
          channelSourceId={headerChannelSourceId}
          channelPlatform={headerChannelPlatform}
          channelName={headerName}
          channelLogoUrl={headerLogoUrl}
          unreadCount={headerUnread}
          totalVideos={totalVideos}
          trailing={headerTrailing}
          markAllReadBody={headerMarkAllReadBody}
          hideSearch={library != null}
        />
        <div className="flex-1 overflow-y-auto">
          <VideoList
            videos={videoList}
            selectedVideoId={selectedVideoId}
            emptyMessage={emptyMessage}
            isLoading={isLoadingVideos}
            onOpenNotes={handleOpenNotes}
            showRemoveFromLibrary={showRemoveFromLibrary}
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
