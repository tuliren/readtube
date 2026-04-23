'use client';

import { Archive, Bookmark, Check, Star, Trash2, X } from 'lucide-react';

import type { BulkAction } from '@/lib/inbox/triageActions';

import { useTriage } from './useTriage';

interface Props {
  selectedIds: string[];
  onClear: () => void;
  /** When true, show the "Remove" action that deletes the selected
   *  videos from the user's library (StandaloneVideo + playlist
   *  memberships). Only set in library list views. */
  showRemoveFromLibrary?: boolean;
}

/**
 * Floating bar that appears at the top of the video list whenever the user
 * has selected at least one row. Exposes a small set of the most common
 * bulk actions; the full set (snooze, unstar, unsave, unarchive) is
 * available through the command palette.
 */
export default function BulkActionBar({ selectedIds, onClear, showRemoveFromLibrary }: Props) {
  const triage = useTriage();

  if (selectedIds.length === 0) {
    return null;
  }

  async function run(action: BulkAction, label: string) {
    const affected = await triage.bulk(selectedIds, action);
    if (affected > 0) {
      onClear();
    }
    return label;
  }

  return (
    <div className="sticky top-0 z-10 flex items-center gap-0.5 border-b border-border bg-blue-50 px-4 py-2 shadow-sm dark:bg-blue-500/15 sidebar:gap-2">
      <button
        type="button"
        onClick={onClear}
        className="rounded p-1 text-muted-foreground hover:bg-accent"
        aria-label="Clear selection"
      >
        <X className="h-4 w-4" />
      </button>
      <span className="text-sm font-medium text-foreground">{selectedIds.length} selected</span>
      <div className="flex-1" />
      <button
        type="button"
        onClick={() => void run({ type: 'mark_read' }, 'marked read')}
        title="Mark read"
        className="flex items-center gap-1 rounded px-2 py-1 text-sm text-foreground hover:bg-accent"
      >
        <Check className="h-4 w-4" />
        <span className="hidden sidebar:inline">Mark read</span>
      </button>
      <button
        type="button"
        onClick={() => void run({ type: 'star' }, 'starred')}
        title="Star"
        className="flex items-center gap-1 rounded px-2 py-1 text-sm text-foreground hover:bg-accent"
      >
        <Star className="h-4 w-4" />
        <span className="hidden sidebar:inline">Star</span>
      </button>
      <button
        type="button"
        onClick={() => void run({ type: 'save' }, 'saved')}
        title="Save"
        className="flex items-center gap-1 rounded px-2 py-1 text-sm text-foreground hover:bg-accent"
      >
        <Bookmark className="h-4 w-4" />
        <span className="hidden sidebar:inline">Save</span>
      </button>
      <button
        type="button"
        onClick={() => void run({ type: 'archive' }, 'archived')}
        title="Archive"
        className="flex items-center gap-1 rounded px-2 py-1 text-sm text-foreground hover:bg-accent"
      >
        <Archive className="h-4 w-4" />
        <span className="hidden sidebar:inline">Archive</span>
      </button>
      {showRemoveFromLibrary && (
        <button
          type="button"
          onClick={() => void run({ type: 'remove_from_library' }, 'removed')}
          title="Remove from library"
          className="flex items-center gap-1 rounded px-2 py-1 text-sm text-red-600 hover:bg-accent dark:text-red-400"
        >
          <Trash2 className="h-4 w-4" />
          <span className="hidden sidebar:inline">Remove</span>
        </button>
      )}
    </div>
  );
}
