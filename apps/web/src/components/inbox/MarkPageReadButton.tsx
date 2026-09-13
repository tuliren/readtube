'use client';

import { StickyNoteCheck } from 'lucide-react';
import { useState } from 'react';

import { iconActionClassName } from '@/components/iconActionStyles';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
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
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex">
            <button
              type="button"
              onClick={handleMarkPageRead}
              disabled={marking || unreadIds.length === 0}
              className={iconActionClassName}
              aria-label="Mark this page as read"
              aria-busy={marking}
            >
              <StickyNoteCheck className="h-4 w-4" />
            </button>
          </span>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          {marking
            ? 'Marking…'
            : unreadIds.length === 0
              ? 'Mark this page as read. Nothing unread.'
              : 'Mark this page as read'}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
