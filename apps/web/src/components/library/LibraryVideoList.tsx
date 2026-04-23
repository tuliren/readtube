'use client';

import { ListMusic, Video } from 'lucide-react';
import { useState } from 'react';

import AddVideoModal from '@/components/inbox/AddVideoModal';
import NewPlaylistDialog from '@/components/inbox/NewPlaylistDialog';

interface Props {
  emptyMessage: string;
}

/**
 * Empty-state component for the library pages (All / Standalone).
 * Shows the message plus "Add video" and "Add playlist" buttons.
 * Non-empty rendering is handled by LibraryListView.
 */
export default function LibraryEmptyState({ emptyMessage }: Props) {
  const [addVideoOpen, setAddVideoOpen] = useState(false);
  const [addPlaylistOpen, setAddPlaylistOpen] = useState(false);

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
      <div>
        <p className="text-lg font-semibold text-foreground">No videos yet</p>
        <p className="mt-1 text-sm text-muted-foreground">{emptyMessage}</p>
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
          className="inline-flex items-center gap-2 rounded-md border border-border bg-background px-4 py-2 text-sm font-medium text-foreground hover:bg-muted"
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
