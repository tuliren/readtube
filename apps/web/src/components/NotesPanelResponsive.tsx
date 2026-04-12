'use client';

import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';

import NotesPanel from './NotesPanel';

interface Props {
  videoId: string;
  subtitle?: string;
  isMobile: boolean;
  onClose: () => void;
}

/**
 * Responsive wrapper for NotesPanel. On desktop, renders the panel
 * inline as a fixed-width side column. On mobile, renders it as a
 * bottom Sheet drawer since there isn't enough horizontal space.
 */
export default function NotesPanelResponsive({ videoId, subtitle, isMobile, onClose }: Props) {
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
          className="flex h-[70vh] flex-col p-0"
          aria-describedby={undefined}
        >
          <SheetTitle className="sr-only">Notes</SheetTitle>
          <NotesPanel videoId={videoId} subtitle={subtitle} onClose={onClose} />
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <div className="flex w-80 shrink-0 flex-col border-l border-gray-200">
      <NotesPanel videoId={videoId} subtitle={subtitle} onClose={onClose} />
    </div>
  );
}
