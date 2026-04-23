'use client';

import { CornerDownLeft, Search, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { Input } from '@/components/ui/input';

import { useInboxQuery } from './useInboxQuery';

/**
 * Enter-to-submit search input. Local state is the source of truth while
 * the user is typing; the URL only gets updated on form submit (Enter)
 * or when the clear button fires. This has two benefits over the
 * previous debounced version:
 *
 * 1. No revert race. The old debounce wrote to the URL 200ms after
 *    each keystroke, which made `query.q` change, which fired a sync
 *    effect `setLocal(query.q)` — if the user kept typing during those
 *    200ms, the sync would land AFTER further keystrokes and revert
 *    them. Making submission explicit means `query.q` only changes
 *    when the user intended it to.
 *
 * 2. Fewer DB queries. plainto_tsquery runs over search_tsv on every
 *    `q=` change; submitting on Enter means one query per search
 *    instead of one per keystroke.
 *
 * External URL changes (e.g. picking a saved view that sets `q`) still
 * sync into the input, but ONLY when it isn't focused — so the
 * "someone else updated the URL while I was mid-typing" path doesn't
 * clobber in-flight edits.
 */
export default function SearchInput() {
  const { query, patchQuery } = useInboxQuery();
  const [local, setLocal] = useState(query.q ?? '');
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync external URL changes into the input — but only when the user
  // isn't actively typing. This covers cases like: user clicks a saved
  // view in the dropdown that has its own `q` value, or the user
  // navigates back/forward in browser history.
  useEffect(() => {
    if (document.activeElement === inputRef.current) {
      return;
    }
    setLocal(query.q ?? '');
  }, [query.q]);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const next = local.trim();
    if (next === (query.q ?? '')) {
      // No-op: submitting the same text shouldn't trigger a refetch.
      return;
    }
    patchQuery({ q: next.length > 0 ? next : undefined });
  }

  function handleClear() {
    setLocal('');
    patchQuery({ q: undefined });
    inputRef.current?.focus();
  }

  // Tooltip hint that only appears when the local value diverges from
  // what's currently filtering the list, so the user knows to press
  // Enter to apply their edit.
  const isDirty = local.trim() !== (query.q ?? '');

  return (
    <form onSubmit={handleSubmit} className="relative flex items-center">
      <Search className="absolute left-2 h-3.5 w-3.5 text-muted-foreground" />
      <Input
        ref={inputRef}
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        onKeyDown={(e) => {
          // Escape clears the current edit without committing.
          if (e.key === 'Escape') {
            setLocal(query.q ?? '');
            inputRef.current?.blur();
          }
        }}
        placeholder="Search videos…"
        title={isDirty ? 'Press Enter to search' : undefined}
        // shadow-none clobbers the shared Input primitive's `shadow-sm`,
        // which read as too heavy at this size on the inbox header rail.
        // Other Inputs (folder dialog, add-channel modal) keep theirs.
        className={`h-7 w-32 rounded-full pl-7 pr-14 text-xs shadow-none sidebar:w-72 ${
          isDirty ? 'border-blue-400 ring-1 ring-blue-200' : ''
        }`}
      />
      {/*
        Dirty affordance: a subtle ⏎ badge appears when local !== query.q
        so the 'press Enter to commit' hint shows up exactly when it's
        actionable, instead of baked into the placeholder where it reads
        as instruction-noise on an empty input.
      */}
      {isDirty && (
        <span className="pointer-events-none absolute right-8 flex items-center text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          <CornerDownLeft className="mr-0.5 h-3 w-3" />
          enter
        </span>
      )}
      {local.length > 0 && (
        <button
          type="button"
          onClick={handleClear}
          className="absolute right-2 text-muted-foreground hover:text-foreground"
          aria-label="Clear search"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </form>
  );
}
