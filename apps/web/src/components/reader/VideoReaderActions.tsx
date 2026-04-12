'use client';

import { Archive, Bookmark, BookmarkCheck, Star } from 'lucide-react';
import { useState } from 'react';

import { useTriage } from '@/components/inbox/useTriage';
import { Button } from '@/components/ui/button';
import type { VideoData } from '@/lib/types';

interface Props {
  video: VideoData;
}

/**
 * Triage action bar shown in the top of the VideoReader header. Mirrors the
 * row actions in VideoRow but with more prominent labels + the larger button
 * size appropriate for a single-video view. Uses local optimistic state so
 * the UI flips immediately without waiting for a re-fetch — the reader is
 * server-rendered so there's no SWR cache to invalidate for this specific
 * video view.
 */
export default function VideoReaderActions({ video }: Props) {
  const triage = useTriage();

  // Optimistic mirror of the server-rendered flags. We flip BEFORE the fetch
  // resolves so the icon state responds immediately; useTriage will revert
  // via a toast if the server rejects the call.
  const [isStarred, setIsStarred] = useState(video.isStarred);
  const [isSaved, setIsSaved] = useState(video.isSaved);
  const [isArchived, setIsArchived] = useState(video.isArchived);

  async function toggleStar() {
    const wasStarred = isStarred;
    setIsStarred(!wasStarred);
    const ok = await triage.toggleStar(video.id, wasStarred);
    if (!ok) {
      setIsStarred(wasStarred);
    }
  }

  async function toggleSave() {
    const wasSaved = isSaved;
    setIsSaved(!wasSaved);
    const ok = await triage.toggleSave(video.id, wasSaved);
    if (!ok) {
      setIsSaved(wasSaved);
    }
  }

  async function toggleArchive() {
    const wasArchived = isArchived;
    setIsArchived(!wasArchived);
    const ok = wasArchived ? await triage.unarchive(video.id) : await triage.archive(video.id);
    if (!ok) {
      setIsArchived(wasArchived);
    }
  }

  // Each button overrides the Button cva's `gap-2` with `gap-1` so the
  // icon sits closer to the label — gap-2 (8px) reads as a yawning
  // void at this size. The labels also drop their `ml-1` because the
  // gap utility already provides spacing.
  const tightGap = 'gap-1';

  return (
    <div className="flex items-center gap-1">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => void toggleStar()}
        className={`${tightGap} ${isStarred ? 'text-yellow-600 hover:text-yellow-700' : ''}`}
        title={isStarred ? 'Unstar' : 'Star'}
      >
        <Star className={`h-4 w-4 ${isStarred ? 'fill-yellow-400' : ''}`} />
        <span className="hidden sm:inline">{isStarred ? 'Starred' : 'Star'}</span>
      </Button>

      <Button
        variant="ghost"
        size="sm"
        onClick={() => void toggleSave()}
        className={`${tightGap} ${isSaved ? 'text-blue-600 hover:text-blue-700' : ''}`}
        title={isSaved ? 'Remove from Read Later' : 'Read Later'}
      >
        {isSaved ? <BookmarkCheck className="h-4 w-4" /> : <Bookmark className="h-4 w-4" />}
        <span className="hidden sm:inline">{isSaved ? 'Saved' : 'Save'}</span>
      </Button>

      <Button
        variant="ghost"
        size="sm"
        onClick={() => void toggleArchive()}
        className={`${tightGap} ${isArchived ? 'text-red-600 hover:text-red-700' : ''}`}
        title={isArchived ? 'Unarchive' : 'Archive'}
      >
        <Archive className="h-4 w-4" />
        <span className="hidden sm:inline">{isArchived ? 'Archived' : 'Archive'}</span>
      </Button>
    </div>
  );
}
