'use client';

import { Archive, Bookmark, Mail, Star } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import type { InboxQuery } from '@/lib/types';

import { useInboxQuery } from './useInboxQuery';

type ViewKey = 'unread' | 'starred' | 'saved' | 'archived';

interface Chip {
  key: ViewKey;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const CHIPS: Chip[] = [
  { key: 'unread', label: 'Unread', icon: Mail },
  { key: 'starred', label: 'Starred', icon: Star },
  { key: 'saved', label: 'Read Later', icon: Bookmark },
  { key: 'archived', label: 'Archived', icon: Archive },
];

// Every key the chips manage as a view. Clicking a chip clears all of
// these and sets just the clicked one (or clears everything if the
// clicked chip was already active).
const VIEW_KEYS: (keyof InboxQuery)[] = ['unread', 'starred', 'saved', 'archived'];

/**
 * Filter chip row. Each chip represents a preset view. Chips are
 * RADIO-EXCLUSIVE among the view keys: clicking one clears every other
 * view chip and activates the clicked one, so you can't end up in an
 * incoherent Starred+Archived intersection. Clicking an already-active
 * chip clears everything (back to the default view).
 *
 * Orthogonal filters (`q`, `channelId`, `folderId`, `tagIds`, `from/to`,
 * `sort`) are intentionally preserved — you legitimately want
 * "Unread within my 'rust' search" or "Starred within the Tech folder",
 * and those compose cleanly with view selection.
 *
 * The chip set is intentionally small — advanced filters (tag, date
 * range, folder) live in the command palette (Stream D) rather than
 * cluttering the header.
 */
export default function FilterBar() {
  const { query, patchQuery } = useInboxQuery();

  function handleChipClick(key: ViewKey) {
    const wasActive = query[key] === true;
    // Build a patch that clears every view key and then sets just the
    // clicked one (unless it was already active, in which case leave
    // everything cleared — clicking an active chip is how you exit a
    // view without having to navigate elsewhere).
    const patch: Partial<InboxQuery> = {};
    for (const viewKey of VIEW_KEYS) {
      patch[viewKey] = undefined;
    }
    if (!wasActive) {
      patch[key] = true;
    }
    patchQuery(patch);
  }

  return (
    <div className="flex items-center gap-1">
      {CHIPS.map((chip) => {
        const Icon = chip.icon;
        const active = query[chip.key] === true;
        return (
          <button
            key={chip.key}
            type="button"
            onClick={() => handleChipClick(chip.key)}
            className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-xs transition-colors ${
              active
                ? 'bg-blue-600 text-white hover:bg-blue-700'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            <Icon className="h-3 w-3" />
            {chip.label}
          </button>
        );
      })}
      {query.sort === 'oldest' && (
        <Badge variant="secondary" className="ml-1 text-[10px]">
          Oldest first
        </Badge>
      )}
    </div>
  );
}
