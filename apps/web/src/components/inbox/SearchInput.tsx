'use client';

import { Search, X } from 'lucide-react';
import { useEffect, useState } from 'react';

import { Input } from '@/components/ui/input';

import { useInboxQuery } from './useInboxQuery';

/**
 * Debounced search input that writes `q` into the URL-backed InboxQuery.
 * The /api/videos list endpoint already knows how to honor `q` via
 * plainto_tsquery, so typing into this input progressively narrows the
 * list. For a rank-ordered dedicated results view, /api/search is the
 * richer endpoint (returns ts_headline snippets); we surface it in a
 * future pass.
 */
export default function SearchInput() {
  const { query, patchQuery } = useInboxQuery();
  const [local, setLocal] = useState(query.q ?? '');

  // Sync local input when the URL changes from outside (e.g. saved-view pick).
  useEffect(() => {
    setLocal(query.q ?? '');
  }, [query.q]);

  // Debounce URL writes so every keystroke doesn't trigger a SWR refetch.
  useEffect(() => {
    const next = local.trim();
    const handle = setTimeout(() => {
      if (next !== (query.q ?? '')) {
        patchQuery({ q: next.length > 0 ? next : undefined });
      }
    }, 200);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [local]);

  return (
    <div className="relative flex items-center">
      <Search className="absolute left-2 h-3.5 w-3.5 text-gray-400" />
      <Input
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        placeholder="Search videos…"
        className="h-7 w-48 rounded-full pl-7 pr-7 text-xs"
      />
      {local.length > 0 && (
        <button
          type="button"
          onClick={() => {
            setLocal('');
            patchQuery({ q: undefined });
          }}
          className="absolute right-2 text-gray-400 hover:text-gray-600"
          aria-label="Clear search"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
