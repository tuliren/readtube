'use client';

import { Archive, Bookmark, Clock, Mail, Star } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import type { InboxQuery } from '@/lib/types';

import { useInboxQuery } from './useInboxQuery';

interface Chip {
  key: keyof Pick<InboxQuery, 'unread' | 'starred' | 'saved' | 'snoozed' | 'archived'>;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const CHIPS: Chip[] = [
  { key: 'unread', label: 'Unread', icon: Mail },
  { key: 'starred', label: 'Starred', icon: Star },
  { key: 'saved', label: 'Read Later', icon: Bookmark },
  { key: 'snoozed', label: 'Snoozed', icon: Clock },
  { key: 'archived', label: 'Archived', icon: Archive },
];

/**
 * Filter chip row. Each chip is a toggle on the URL-backed InboxQuery.
 * Defaults (all off) match the default inbox view; toggling a chip
 * writes its key=true to the query string, toggling off strips the key.
 *
 * The chip set is intentionally small — advanced filters (tag, date
 * range, folder) live in the command palette (Stream D) rather than
 * cluttering the header.
 */
export default function FilterBar() {
  const { query, patchQuery } = useInboxQuery();

  return (
    <div className="flex items-center gap-1">
      {CHIPS.map((chip) => {
        const Icon = chip.icon;
        const active = query[chip.key] === true;
        return (
          <button
            key={chip.key}
            type="button"
            onClick={() => patchQuery({ [chip.key]: active ? undefined : true })}
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
