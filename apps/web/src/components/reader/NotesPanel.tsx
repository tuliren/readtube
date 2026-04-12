'use client';

import { useEffect, useRef } from 'react';

import NotesPanelResponsive from '@/components/NotesPanelResponsive';
import { useSidebar } from '@/components/inbox/SidebarContext';

interface Props {
  videoId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Reader-specific notes panel wrapper. Handles closing the panel and
 * resetting state when the user soft-navigates to a different video
 * (Next.js reuses the component tree on sibling-video clicks).
 * On mobile, renders as a bottom drawer instead of a side panel.
 */
export default function ReaderNotesPanel({ videoId, open, onOpenChange }: Props) {
  const { isMobile } = useSidebar();
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

  return (
    <NotesPanelResponsive
      videoId={videoId}
      isMobile={isMobile}
      onClose={() => onOpenChange(false)}
    />
  );
}
