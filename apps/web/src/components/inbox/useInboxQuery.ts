'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useMemo } from 'react';

import { encodeInboxQuery, extractInboxSearchParams, parseInboxQuery } from '@/lib/inbox/filter';
import type { InboxQuery } from '@/lib/types';

/**
 * Read/write the inbox filter state from the URL. A thin wrapper around
 * Next.js's useSearchParams + router.replace so every component
 * (SearchInput, FilterBar, SavedViewMenu) can read and mutate the same
 * canonical shape.
 *
 * We deliberately use router.replace (not push) so filter changes don't
 * pollute browser history. The "channel" search param is preserved via
 * the codec.
 */
export function useInboxQuery() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Unwrap the `returnTo` indirection used by the reader: in
  // `/inbox/<id>` the canonical filter context lives in
  // `?returnTo=<encoded-inner>` rather than as direct top-level
  // params, so the FilterBar / saved views / search box still see
  // the same query they came from.
  const query = useMemo<InboxQuery>(
    () => parseInboxQuery(extractInboxSearchParams(searchParams)),
    [searchParams]
  );

  const setQuery = useCallback(
    (next: InboxQuery) => {
      const params = encodeInboxQuery(next);
      const qs = params.toString();
      router.replace(qs.length > 0 ? `${pathname}?${qs}` : pathname);
    },
    [router, pathname]
  );

  const patchQuery = useCallback(
    (patch: Partial<InboxQuery>) => {
      const next: InboxQuery = { ...query, ...patch };
      // Strip keys whose values are undefined so they don't appear as
      // explicit empty strings in the URL.
      for (const key of Object.keys(patch) as (keyof InboxQuery)[]) {
        if (patch[key] === undefined) {
          delete next[key];
        }
      }
      // Any non-page change (filter chip toggle, search edit, saved
      // view jump, etc.) resets the page back to 1. The user expects
      // to land on the first page of the new view, not at "page 5"
      // of an entirely different filter. The page setter still
      // works because a `{ page: N }` patch is page-only and so
      // skipped by this branch.
      const patchKeys = Object.keys(patch) as (keyof InboxQuery)[];
      const onlyPagePatch = patchKeys.length > 0 && patchKeys.every((k) => k === 'page');
      if (!onlyPagePatch) {
        delete next.page;
      }
      setQuery(next);
    },
    [query, setQuery]
  );

  return { query, setQuery, patchQuery };
}
