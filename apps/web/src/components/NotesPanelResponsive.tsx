'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';

import NotesPanel from './NotesPanel';

interface Props {
  videoId: string;
  subtitle?: string;
  isMobile: boolean;
  onClose: () => void;
}

const STORAGE_KEY = 'notes-panel-width';
const DEFAULT_WIDTH = 320;
const MIN_WIDTH = 240;
const MAX_WIDTH = 720;

function readStoredWidth(): number {
  if (typeof window === 'undefined') {
    return DEFAULT_WIDTH;
  }
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (raw == null) {
    return DEFAULT_WIDTH;
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_WIDTH;
  }
  return Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, parsed));
}

/**
 * Responsive wrapper for NotesPanel. On desktop, renders the panel
 * inline as a resizable side column with a drag handle on the left
 * edge — the user-chosen width is persisted to localStorage so it
 * survives reloads and follows the user across videos. On mobile,
 * renders as a bottom Sheet drawer since there isn't enough horizontal
 * space for a side column.
 */
export default function NotesPanelResponsive({ videoId, subtitle, isMobile, onClose }: Props) {
  const [width, setWidth] = useState<number>(DEFAULT_WIDTH);
  const [isDragging, setIsDragging] = useState(false);
  // Reading from localStorage during render would either trip an SSR
  // hydration mismatch (server has no localStorage) or force the panel
  // to default-flicker on the client's first paint. Seed once on mount
  // instead.
  useEffect(() => {
    setWidth(readStoredWidth());
  }, []);

  // The drag handlers attach mousemove/mouseup at document scope so the
  // user can drag the cursor outside the handle (and even outside the
  // panel) without losing the grab — without document-level listeners
  // the handle would only track movement that stays directly over its
  // 8px hitbox. Refs hold the live drag baseline so the handlers don't
  // need to re-bind on every width tick.
  const dragStartXRef = useRef(0);
  const dragStartWidthRef = useRef(DEFAULT_WIDTH);

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      dragStartXRef.current = event.clientX;
      dragStartWidthRef.current = width;
      setIsDragging(true);
    },
    [width]
  );

  useEffect(() => {
    if (!isDragging) {
      return;
    }
    const handleMove = (event: PointerEvent) => {
      // The panel sits on the right edge — moving the cursor LEFT
      // should grow the panel, hence the inverted delta.
      const delta = dragStartXRef.current - event.clientX;
      const next = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, dragStartWidthRef.current + delta));
      setWidth(next);
    };
    const handleUp = () => {
      setIsDragging(false);
    };
    document.addEventListener('pointermove', handleMove);
    document.addEventListener('pointerup', handleUp);
    document.addEventListener('pointercancel', handleUp);
    // While dragging, suppress text-selection across the page and pin
    // the cursor to the resize affordance — otherwise the browser
    // happily selects whatever paragraph the cursor sweeps over and
    // resets the cursor to a text caret as soon as it leaves the
    // 8px hitbox.
    const previousUserSelect = document.body.style.userSelect;
    const previousCursor = document.body.style.cursor;
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';
    return () => {
      document.removeEventListener('pointermove', handleMove);
      document.removeEventListener('pointerup', handleUp);
      document.removeEventListener('pointercancel', handleUp);
      document.body.style.userSelect = previousUserSelect;
      document.body.style.cursor = previousCursor;
    };
  }, [isDragging]);

  // Persist after the drag settles rather than on every tick — avoids
  // hammering localStorage during the drag and keeps the stored value
  // aligned with what the user actually committed to.
  useEffect(() => {
    if (isDragging || typeof window === 'undefined') {
      return;
    }
    if (width === DEFAULT_WIDTH) {
      // Skip writing the default on first mount so a fresh visitor
      // doesn't get a localStorage entry just for opening the panel.
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored == null) {
        return;
      }
    }
    window.localStorage.setItem(STORAGE_KEY, String(width));
  }, [isDragging, width]);

  if (isMobile) {
    return (
      <Sheet
        open
        onOpenChange={(open) => {
          if (!open) {
            onClose();
          }
        }}
      >
        <SheetContent
          side="bottom"
          className="flex h-[60vh] flex-col p-0"
          aria-describedby={undefined}
        >
          <SheetTitle className="sr-only">Notes</SheetTitle>
          <NotesPanel videoId={videoId} subtitle={subtitle} onClose={onClose} />
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <div className="relative flex shrink-0 flex-col border-l border-border" style={{ width }}>
      {/* Drag handle. The visual line is 1px (the panel's border-l)
          but the hitbox is 8px wide and centered on the border, so
          the user has a comfortable target without a chunky visible
          divider. `cursor-col-resize` and the `touch-none` hint
          prevent touch scroll from hijacking the gesture on tablets. */}
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize notes panel"
        onPointerDown={handlePointerDown}
        className="absolute top-0 -left-1 z-10 h-full w-2 cursor-col-resize touch-none select-none hover:bg-blue-500/20 active:bg-blue-500/30"
      />
      <NotesPanel videoId={videoId} subtitle={subtitle} onClose={onClose} />
    </div>
  );
}
