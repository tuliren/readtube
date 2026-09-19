'use client';

import { useEffect, useLayoutEffect, useRef } from 'react';

import {
  type ListScrollPosition,
  readListScroll,
  saveListScroll,
  takeArmedListScrollKey,
} from '@/lib/inbox/scrollMemory';

/**
 * Attribute `VideoRow` stamps on its `<li>` so the restore logic can
 * find a row to anchor against without the two components sharing
 * refs.
 */
export const SCROLL_ANCHOR_ATTRIBUTE = 'data-video-id';

function anchorRows(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(`[${SCROLL_ANCHOR_ATTRIBUTE}]`));
}

/**
 * Where the user is right now: the raw offset plus the row at the
 * top edge and how far it sits above it. Cheap — a list page holds
 * at most `PAGE_SIZE` rows, and this runs once per scroll settle,
 * not once per frame.
 */
export function measureListScroll(container: HTMLElement): ListScrollPosition {
  const offset = container.scrollTop;
  const containerTop = container.getBoundingClientRect().top;
  for (const row of anchorRows(container)) {
    const rect = row.getBoundingClientRect();
    // The first row still showing any part of itself below the top
    // edge is the one the user considers "where they are".
    if (rect.bottom > containerTop) {
      return {
        offset,
        anchorId: row.getAttribute(SCROLL_ANCHOR_ATTRIBUTE),
        anchorOffset: rect.top - containerTop,
      };
    }
  }
  return { offset, anchorId: null, anchorOffset: 0 };
}

/**
 * Put the anchor row back where it was. Falls back to the raw pixel
 * offset when the anchor is gone — the list may have been refiltered
 * while the user was away — which still lands them in the right
 * neighborhood.
 */
export function restoreListScroll(container: HTMLElement, position: ListScrollPosition): void {
  if (position.anchorId != null) {
    const row = anchorRows(container).find(
      (candidate) => candidate.getAttribute(SCROLL_ANCHOR_ATTRIBUTE) === position.anchorId
    );
    if (row != null) {
      const currentTop = row.getBoundingClientRect().top - container.getBoundingClientRect().top;
      // Relative adjustment rather than an absolute assignment: it
      // needs no assumptions about the row's offsetParent or the
      // container's own padding. The browser clamps the result to
      // the scrollable range on its own.
      container.scrollTop += currentTop - position.anchorOffset;
      return;
    }
  }
  container.scrollTop = position.offset;
}

interface Options {
  /** Canonical identity of the list being shown, from `normalizeListKey`. */
  listKey: string;
  /** True once rows are on screen, so there is something to anchor to. */
  ready: boolean;
}

/**
 * Remembers and restores the scroll position of a video list across
 * the trip into the reader and back.
 *
 * Returns a ref for the scrolling container. Rows inside it are
 * matched by `SCROLL_ANCHOR_ATTRIBUTE`.
 *
 * Restoring is deliberately once-per-mount and gated on an armed key
 * (see `lib/inbox/scrollMemory`): coming back from a video lands you
 * where you were, while a fresh navigation to the same list starts
 * at the top.
 */
export function useListScrollRestoration({ listKey, ready }: Options) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Latest key, for the effects below that outlive a given render.
  const listKeyRef = useRef(listKey);
  useEffect(() => {
    listKeyRef.current = listKey;
  }, [listKey]);

  // The armed key is consumed at most once per mount. `read` guards
  // the consumption rather than the effect's dep list because React
  // StrictMode runs mount effects twice in development, and the
  // second pass would otherwise find the key already cleared.
  const armedRef = useRef<{ read: boolean; key: string | null }>({ read: false, key: null });
  // Gates persistence: until the restore pass has had its chance, the
  // container is sitting at offset 0 and writing that would clobber
  // the position we are about to restore.
  const restoredRef = useRef(false);
  // Last offset seen while the container was still measurable.
  const lastOffsetRef = useRef(0);

  useLayoutEffect(() => {
    if (restoredRef.current || !ready) {
      return;
    }
    const container = containerRef.current;
    if (container == null) {
      return;
    }
    if (!armedRef.current.read) {
      armedRef.current = { read: true, key: takeArmedListScrollKey() };
    }
    restoredRef.current = true;
    if (armedRef.current.key !== listKey) {
      return;
    }
    const position = readListScroll(listKey);
    if (position == null) {
      return;
    }
    restoreListScroll(container, position);
    // A programmatic scroll does not reliably raise a scroll event,
    // so seed the fallback offset rather than wait for one.
    lastOffsetRef.current = container.scrollTop;
  }, [ready, listKey]);

  // Changing the filter, the search text, or the page replaces the
  // list under a mounted component. Start that new list at the top
  // instead of leaving the user mid-way down a list they have never
  // seen. Skipped on the first run, which is the restore's turn.
  const previousKeyRef = useRef(listKey);
  useLayoutEffect(() => {
    if (previousKeyRef.current === listKey) {
      return;
    }
    previousKeyRef.current = listKey;
    const container = containerRef.current;
    if (container != null) {
      container.scrollTop = 0;
      lastOffsetRef.current = 0;
    }
  }, [listKey]);

  // The position is written once, on the way out, rather than as the
  // user scrolls: every route out of a list unmounts it, so the
  // cleanup below is a single choke point that catches a row click, a
  // command-palette jump, and a sidebar navigation alike — no need to
  // hang a save off each of those call sites, and no storage traffic
  // during a scroll.
  //
  // A layout effect, not a passive one, purely for that cleanup:
  // React defers passive cleanups until after the commit, by which
  // point the container has been detached and its scrollTop reads 0.
  // Layout cleanups run during the mutation phase, while the node is
  // still in the document and still knows where it was scrolled to.
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (container == null) {
      return;
    }

    // One property read per scroll event — no measuring, no storage.
    // Its only job is to keep a usable offset around in case the
    // container is already detached when we come to persist, which
    // would otherwise cost us the position entirely.
    const onScroll = () => {
      lastOffsetRef.current = container.scrollTop;
    };

    const persist = () => {
      if (!restoredRef.current) {
        return;
      }
      const position = container.isConnected
        ? measureListScroll(container)
        : { offset: lastOffsetRef.current, anchorId: null, anchorOffset: 0 };
      saveListScroll(listKeyRef.current, position);
    };

    container.addEventListener('scroll', onScroll, { passive: true });
    // Covers the paths that skip React teardown entirely: a real page
    // load, a tab close, a bfcache suspend.
    window.addEventListener('pagehide', persist);

    return () => {
      container.removeEventListener('scroll', onScroll);
      window.removeEventListener('pagehide', persist);
      persist();
    };
  }, []);

  return containerRef;
}
