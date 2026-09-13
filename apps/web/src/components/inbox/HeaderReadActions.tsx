'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

import type { VideoData } from '@/lib/types';

import MarkAllReadButton from './MarkAllReadButton';
import MarkPageReadButton from './MarkPageReadButton';
import { useSidebar } from './SidebarContext';

export default function HeaderReadActions({
  videos,
  unreadCount,
  body,
  scopeName,
}: {
  videos: VideoData[];
  unreadCount: number;
  body: Record<string, unknown>;
  scopeName: string;
}) {
  const { isMobile } = useSidebar();
  const [mobileTarget, setMobileTarget] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setMobileTarget(isMobile ? document.getElementById('mobile-read-actions') : null);
  }, [isMobile]);

  // Keep both actions tied to the displayed list's scope on desktop and mobile.
  const actions = (
    <div className="flex shrink-0 items-center gap-1">
      <MarkPageReadButton videos={videos} />
      {unreadCount > 0 && <MarkAllReadButton body={body} scopeName={scopeName} />}
    </div>
  );
  if (isMobile) {
    return mobileTarget != null ? createPortal(actions, mobileTarget) : null;
  }
  return actions;
}
