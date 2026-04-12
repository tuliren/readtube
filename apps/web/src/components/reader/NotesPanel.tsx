'use client';

import { useEffect, useRef } from 'react';

import SharedNotesPanel from '@/components/NotesPanel';

interface Props {
  videoId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Reader-specific notes panel wrapper. Handles closing the panel and
 * resetting state when the user soft-navigates to a different video
 * (Next.js reuses the component tree on sibling-video clicks).
 */
export default function ReaderNotesPanel({ videoId, open, onOpenChange }: Props) {
  const previousVideoIdRef = useRef(videoId);
  useEffect(() => {
    if (previousVideoIdRef.current === videoId) {
      return;
    }
    previousVideoIdRef.current = videoId;
    onOpenChange(false);
  }, [videoId, onOpenChange]);

  if (!open) {
    return null;
  }

  return <SharedNotesPanel videoId={videoId} onClose={() => onOpenChange(false)} />;
}
