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

  // Tighten the layout on narrow viewports: `gap-1` icon-to-label
  // because the cva default `gap-2` reads as a yawning void at this
  // size, and `px-1.5` per button below `lg:` so a row of icon-only
  // buttons sits packed instead of leaving 24px of dead space
  // between every glyph. At `lg:` and up the labels are visible
  // and the buttons restore the cva default `px-3`.
  const buttonClass = 'gap-1 px-1.5 lg:px-3';

  return (
    <div className="flex items-center gap-0 lg:gap-1">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => void toggleStar()}
        className={`${buttonClass} ${isStarred ? 'text-yellow-600 hover:text-yellow-700' : ''}`}
        title={isStarred ? 'Unstar' : 'Star'}
      >
        <Star className={`h-4 w-4 ${isStarred ? 'fill-yellow-400' : ''}`} />
        <span className="hidden lg:inline">{isStarred ? 'Starred' : 'Star'}</span>
      </Button>

      <Button
        variant="ghost"
        size="sm"
        onClick={() => void toggleSave()}
        className={`${buttonClass} ${isSaved ? 'text-blue-600 hover:text-blue-700' : ''}`}
        title={isSaved ? 'Remove from Read Later' : 'Read Later'}
      >
        {isSaved ? <BookmarkCheck className="h-4 w-4" /> : <Bookmark className="h-4 w-4" />}
        <span className="hidden lg:inline">{isSaved ? 'Saved' : 'Save'}</span>
      </Button>

      <Button
        variant="ghost"
        size="sm"
        onClick={() => void toggleArchive()}
        className={`${buttonClass} ${isArchived ? 'text-red-600 hover:text-red-700' : ''}`}
        title={isArchived ? 'Unarchive' : 'Archive'}
      >
        <Archive className="h-4 w-4" />
        <span className="hidden lg:inline">{isArchived ? 'Archived' : 'Archive'}</span>
      </Button>
    </div>
  );
}
