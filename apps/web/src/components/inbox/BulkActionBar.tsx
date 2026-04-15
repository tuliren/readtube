'use client';

import { Archive, Bookmark, Check, Star, X } from 'lucide-react';

import type { BulkAction } from '@/lib/inbox/triageActions';

import { useTriage } from './useTriage';

interface Props {
  selectedIds: string[];
  onClear: () => void;
}

/**
 * Floating bar that appears at the top of the video list whenever the user
 * has selected at least one row. Exposes a small set of the most common
 * bulk actions; the full set (snooze, unstar, unsave, unarchive) is
 * available through the command palette.
 */
export default function BulkActionBar({ selectedIds, onClear }: Props) {
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
    <div className="flex items-center gap-0.5 border-b border-gray-200 bg-blue-50 px-4 py-2 lg:gap-2">
      <button
        type="button"
        onClick={onClear}
        className="rounded p-1 text-gray-500 hover:bg-white"
        aria-label="Clear selection"
      >
        <X className="h-4 w-4" />
      </button>
      <span className="text-sm font-medium text-gray-700">{selectedIds.length} selected</span>
      <div className="flex-1" />
      <button
        type="button"
        onClick={() => void run({ type: 'mark_read' }, 'marked read')}
        title="Mark read"
        className="flex items-center gap-1 rounded px-2 py-1 text-sm text-gray-700 hover:bg-white"
      >
        <Check className="h-4 w-4" />
        <span className="hidden lg:inline">Mark read</span>
      </button>
      <button
        type="button"
        onClick={() => void run({ type: 'star' }, 'starred')}
        title="Star"
        className="flex items-center gap-1 rounded px-2 py-1 text-sm text-gray-700 hover:bg-white"
      >
        <Star className="h-4 w-4" />
        <span className="hidden lg:inline">Star</span>
      </button>
      <button
        type="button"
        onClick={() => void run({ type: 'save' }, 'saved')}
        title="Save"
        className="flex items-center gap-1 rounded px-2 py-1 text-sm text-gray-700 hover:bg-white"
      >
        <Bookmark className="h-4 w-4" />
        <span className="hidden lg:inline">Save</span>
      </button>
      <button
        type="button"
        onClick={() => void run({ type: 'archive' }, 'archived')}
        title="Archive"
        className="flex items-center gap-1 rounded px-2 py-1 text-sm text-gray-700 hover:bg-white"
      >
        <Archive className="h-4 w-4" />
        <span className="hidden lg:inline">Archive</span>
      </button>
    </div>
  );
}
