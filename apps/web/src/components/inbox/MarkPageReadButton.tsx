'use client';

import { StickyNoteCheck } from 'lucide-react';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

import type { VideoData } from '@/lib/types';

import { useSidebar } from './SidebarContext';
import { useTriage } from './useTriage';

export default function MarkPageReadButton({ videos }: { videos: VideoData[] }) {
  const { bulk } = useTriage();
  const { isMobile } = useSidebar();
  const [mobileTarget, setMobileTarget] = useState<HTMLElement | null>(null);

  // The mobile action row belongs to the dashboard shell, while the current
  // page's videos belong to this header. A portal keeps the action beside
  // Mark all as read without copying page data into the shell's state.
  useEffect(() => {
    setMobileTarget(isMobile ? document.getElementById('mobile-page-read-action') : null);
  }, [isMobile]);
  const [marking, setMarking] = useState(false);
  const unreadIds = videos.filter((video) => video.readAt == null).map((video) => video.id);

  async function handleMarkPageRead() {
    if (marking || unreadIds.length === 0) {
      return;
    }
    setMarking(true);
    try {
      // Capture only the displayed unread rows. Never advance a watermark:
      // search, filters, and pagination can leave older videos off this page.
      await bulk(unreadIds, { type: 'mark_read' });
    } finally {
      setMarking(false);
    }
  }

  const button = (
    <button
      type="button"
      onClick={handleMarkPageRead}
      disabled={marking || unreadIds.length === 0}
      className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50 disabled:hover:bg-transparent"
      aria-label="Mark this page as read"
      title="Mark this page as read"
    >
      <StickyNoteCheck className="h-4 w-4" />
      <span className="hidden sidebar:inline">
        {marking ? 'Marking…' : 'Mark this page as read'}
      </span>
    </button>
  );

  if (isMobile) {
    return mobileTarget != null ? createPortal(button, mobileTarget) : null;
  }
  return button;
}
