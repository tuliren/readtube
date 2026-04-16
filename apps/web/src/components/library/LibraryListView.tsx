'use client';

import { useState } from 'react';

import ExternalLinkActions from '@/components/ExternalLinkActions';
import NotesPanelResponsive from '@/components/NotesPanelResponsive';
import InboxHeader from '@/components/inbox/InboxHeader';
import { useSidebar } from '@/components/inbox/SidebarContext';
import VideoList from '@/components/inbox/VideoList';
import type { VideoData } from '@/lib/types';

interface Props {
  title: string;
  videos: VideoData[];
  /** YouTube URL for the entity (playlist). Renders an external-link
   *  icon + copy button next to the title in the header. */
  youtubeUrl?: string;
  /** Playlist DB id. When set, mark-all-as-read sets the playlist's
   *  read_at watermark. */
  playlistId?: string;
  /** When true, mark-all-as-read only covers videos not in any
   *  playlist (the Standalone view). */
  standaloneOnly?: boolean;
}

/**
 * Full-featured list view for library pages (All / Standalone /
 * Playlist). Mirrors the channel page layout: InboxHeader on top
 * (with mark-all-as-read), VideoList with S·A·T badges and triage
 * icons, plus the notes side panel.
 */
export default function LibraryListView({
  title,
  videos,
  youtubeUrl,
  playlistId,
  standaloneOnly,
}: Props) {
  const { isMobile } = useSidebar();
  const [notesVideo, setNotesVideo] = useState<{ id: string; title: string } | null>(null);

  const unreadCount = videos.filter((v) => v.readAt == null).length;

  function handleOpenNotes(videoId: string, videoTitle: string) {
    if (notesVideo?.id === videoId) {
      setNotesVideo(null);
    } else {
      setNotesVideo({ id: videoId, title: videoTitle });
    }
  }

  return (
    <div className="flex flex-1 overflow-hidden">
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <InboxHeader
          channelId={null}
          channelSourceId={null}
          channelName={title}
          channelLogoUrl={null}
          unreadCount={unreadCount}
          totalVideos={videos.length}
          markAllReadBody={
            playlistId != null
              ? { playlistId }
              : standaloneOnly
                ? { standaloneOnly: true }
                : { library: true }
          }
          trailing={
            youtubeUrl != null ? (
              <ExternalLinkActions url={youtubeUrl} label="Open on YouTube" />
            ) : undefined
          }
        />
        <div className="flex-1 overflow-y-auto">
          <VideoList
            videos={videos}
            selectedVideoId={null}
            emptyMessage="No videos in this list."
            isLoading={false}
            onOpenNotes={handleOpenNotes}
            showRemoveFromLibrary
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
