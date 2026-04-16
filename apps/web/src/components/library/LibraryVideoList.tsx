'use client';

import { ListMusic, Video } from 'lucide-react';
import { useState } from 'react';

import AddVideoModal from '@/components/inbox/AddVideoModal';
import NewPlaylistDialog from '@/components/inbox/NewPlaylistDialog';
import VideoList from '@/components/inbox/VideoList';
import type { VideoData } from '@/lib/types';

interface Props {
  videos: VideoData[];
  emptyMessage: string;
  /** Show "Add video" + "Add playlist" buttons in the empty state. */
  showAddActions?: boolean;
}

/**
 * Thin wrapper around the inbox VideoList for the library pages
 * (All / Standalone / Playlist). Reuses the same row component so
 * S·A·T badges, descriptions, and triage icons are all present.
 * The only library-specific bit is the empty-state with add buttons.
 */
export default function LibraryVideoList({ videos, emptyMessage, showAddActions }: Props) {
  const [notesVideo, setNotesVideo] = useState<{ id: string; title: string } | null>(null);

  if (videos.length === 0) {
    if (showAddActions) {
      return <LibraryEmptyState message={emptyMessage} />;
    }
    return (
      <div className="flex flex-1 items-center justify-center px-4 py-24 text-sm text-gray-500">
        {emptyMessage}
      </div>
    );
  }

  return (
    <VideoList
      videos={videos}
      selectedVideoId={null}
      emptyMessage={emptyMessage}
      isLoading={false}
      onOpenNotes={(id, title) => setNotesVideo({ id, title })}
    />
  );
}

function LibraryEmptyState({ message }: { message: string }) {
  const [addVideoOpen, setAddVideoOpen] = useState(false);
  const [addPlaylistOpen, setAddPlaylistOpen] = useState(false);

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
      <div>
        <p className="text-lg font-semibold text-gray-700">No videos yet</p>
        <p className="mt-1 text-sm text-gray-500">{message}</p>
      </div>
      <div className="flex gap-3">
        <button
          onClick={() => setAddVideoOpen(true)}
          className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          <Video className="h-4 w-4" />
          Add video
        </button>
        <button
          onClick={() => setAddPlaylistOpen(true)}
          className="inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          <ListMusic className="h-4 w-4" />
          Add playlist
        </button>
      </div>
      <AddVideoModal open={addVideoOpen} onOpenChange={setAddVideoOpen} />
      <NewPlaylistDialog
        open={addPlaylistOpen}
        onOpenChange={setAddPlaylistOpen}
        onCreated={() => {}}
      />
    </div>
  );
}
