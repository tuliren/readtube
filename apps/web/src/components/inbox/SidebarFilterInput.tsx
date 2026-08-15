'use client';

import { Search, X } from 'lucide-react';

import { Input } from '@/components/ui/input';

interface Props {
  value: string;
  onChange: (value: string) => void;
}

/**
 * Search box pinned at the top of the sidebar. While it holds text,
 * ChannelSection swaps the Views/Videos/Channels sections for a flat
 * list of matching navbar items (see SidebarFilterResults). Purely a
 * local filter — no server round-trip; ⌘K is the full-content search.
 */
export default function SidebarFilterInput({ value, onChange }: Props) {
  return (
    <div className="relative flex items-center px-3 pt-3">
      <Search className="pointer-events-none absolute left-5 h-3.5 w-3.5 text-muted-foreground" />
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          // Escape clears the filter (restoring the normal sections)
          // instead of bubbling up to close the mobile drawer.
          if (e.key === 'Escape' && value.length > 0) {
            e.preventDefault();
            e.stopPropagation();
            onChange('');
          }
        }}
        placeholder="Filter sidebar..."
        // shadow-none: the shared Input primitive's `shadow-sm` reads
        // too heavy at this size against the sidebar background.
        className="h-7 rounded-full pl-7 pr-7 text-xs shadow-none"
      />
      {value.length > 0 && (
        <button
          type="button"
          onClick={() => onChange('')}
          className="absolute right-5 text-muted-foreground hover:text-foreground"
          aria-label="Clear sidebar filter"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
