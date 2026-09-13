'use client';

import { StickyNoteCheck } from 'lucide-react';
import { useState } from 'react';

import type { VideoData } from '@/lib/types';

import { useTriage } from './useTriage';

export default function MarkPageReadButton({ videos }: { videos: VideoData[] }) {
  const { bulk } = useTriage();
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

  return (
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
}
