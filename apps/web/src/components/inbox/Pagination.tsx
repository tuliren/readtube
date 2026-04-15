'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';

import { PAGE_SIZE } from '@/lib/inbox/filter';

import { useInboxQuery } from './useInboxQuery';

interface Props {
  /** Total number of videos that match the current filter, BEFORE
   *  pagination. Sourced from `loadInboxVideos` (server) +
   *  `/api/videos` (client). */
  total: number;
}

/**
 * Compact Prev / Page X of Y / Next pagination control rendered in
 * the inbox header. The header is sticky relative to the scrolling
 * video list, so the user can paginate without scrolling back up.
 *
 * Page state lives entirely in the URL via the InboxQuery codec —
 * `?page=2` is the canonical state, and clicking a button calls
 * `patchQuery({ page: N })`. The patchQuery hook uses
 * router.replace, so paginating doesn't pollute browser history.
 *
 * Hidden entirely when the total fits on a single page (no point
 * showing "Page 1 of 1").
 */
export default function Pagination({ total }: Props) {
  const { query, patchQuery } = useInboxQuery();

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const hasMultiplePages = totalPages > 1;

  // Clamp the displayed current page to the valid range — if the user
  // hand-edits the URL to a too-large page, render as if they're on
  // the last page rather than going past the end.
  const currentPage = Math.min(Math.max(1, query.page ?? 1), totalPages);

  const isFirst = currentPage === 1;
  const isLast = currentPage === totalPages;

  // The visible row index range for the current page (1-indexed,
  // inclusive). Used in the "X-Y of N" copy so the user can see
  // exactly how many results they're looking at.
  const firstRow = (currentPage - 1) * PAGE_SIZE + 1;
  const lastRow = Math.min(currentPage * PAGE_SIZE, total);

  function goTo(nextPage: number) {
    const clamped = Math.min(Math.max(1, nextPage), totalPages);
    if (clamped === currentPage) {
      return;
    }
    // Page 1 is the default — encode as `undefined` so the codec
    // drops the param and the URL stays clean.
    patchQuery({ page: clamped === 1 ? undefined : clamped });
  }

  return (
    <div className="flex items-center gap-2 text-xs text-gray-500">
      <span className="tabular-nums">
        {hasMultiplePages
          ? `${firstRow}–${lastRow} of ${total}`
          : `${total} ${total === 1 ? 'video' : 'videos'}`}
      </span>
      {hasMultiplePages && (
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={() => goTo(currentPage - 1)}
            disabled={isFirst}
            aria-label="Previous page"
            title="Previous page"
            className="rounded p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-700 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-gray-500"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="px-1 tabular-nums">
            Page {currentPage} of {totalPages}
          </span>
          <button
            type="button"
            onClick={() => goTo(currentPage + 1)}
            disabled={isLast}
            aria-label="Next page"
            title="Next page"
            className="rounded p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-700 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-gray-500"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}
