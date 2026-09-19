'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

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
  /**
   * True once the list's data has arrived, rows or an empty result.
   * An empty list has nothing to restore into but still counts as
   * restored: that lets the write on the way out replace the stale
   * position with the empty list's own, instead of preserving it.
   */
  ready: boolean;
  /**
   * Opaque token for the row layout in force. When it changes before
   * the user has scrolled, the restore is re-applied against the new
   * row heights — see the re-anchor effect below for why that matters.
   */
  layoutKey: string;
}

/**
 * Remembers and restores the scroll position of a video list across
 * the trip into the reader and back.
 *
 * Returns a callback ref for the scrolling container. Rows inside it
 * are matched by `SCROLL_ANCHOR_ATTRIBUTE`.
 *
 * Restoring is deliberately once-per-mount and gated on an armed key
 * (see `lib/inbox/scrollMemory`): coming back from a video lands you
 * where you were, while a fresh navigation to the same list starts
 * at the top.
 */
export function useListScrollRestoration({ listKey, ready, layoutKey }: Options) {
  // The container is state, not a plain ref, and the ref handed back
  // is a callback: every effect below needs to run *when the node
  // arrives*, which is not always the mount. `VideoListView` returns
  // a no-channels CTA in place of the list, so a user who adds their
  // first channel attaches the scroller to an already-mounted
  // component. A `useRef` read inside a `[]`-dep effect would find
  // null on that mount and never look again, leaving the list with no
  // scroll listener and no write on the way out — the whole feature
  // silently dead until a reload.
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const containerRef = useCallback((node: HTMLDivElement | null) => {
    setContainer(node);
  }, []);

  // Latest key, for the effects below that outlive a given render.
  const listKeyRef = useRef(listKey);
  useEffect(() => {
    listKeyRef.current = listKey;
  }, [listKey]);

  // The armed key is consumed once per mount, on the first run of the
  // restore effect and before it checks whether the list is ready.
  // `read` guards the consumption rather than the effect's dep list
  // because React StrictMode runs mount effects twice in development,
  // and the second pass would otherwise find the key already cleared.
  const armedRef = useRef<{ read: boolean; key: string | null }>({ read: false, key: null });
  // Gates persistence: until the restore pass has had its chance, the
  // container is sitting at offset 0 and writing that would clobber
  // the position we are about to restore.
  const restoredRef = useRef(false);
  // Last offset seen while the container was still measurable.
  const lastOffsetRef = useRef(0);
  // The offset we last set ourselves. A programmatic scroll raises a
  // scroll event a frame later that is indistinguishable from a real
  // one, so the handler tells them apart by comparing against this
  // rather than by trying to filter the event.
  const ownOffsetRef = useRef(0);
  // The position the restore put the user at, kept so the re-anchor
  // effect below can apply it again. Null once the user takes over.
  const restoredPositionRef = useRef<ListScrollPosition | null>(null);

  /** Scroll the container ourselves, and note that we did. */
  const scrollTo = (node: HTMLElement, apply: () => void) => {
    apply();
    lastOffsetRef.current = node.scrollTop;
    ownOffsetRef.current = node.scrollTop;
  };

  useLayoutEffect(() => {
    // Spend the arm before any readiness check. Gating it on rows
    // would leave the key in storage whenever the return lands on an
    // empty list (the unread inbox after its last video, say) or on
    // the no-channels CTA, and a leaked arm fires on whatever visit
    // to that list comes next: a fresh sidebar click, or this same
    // mount minutes later when a revalidation finally brings rows.
    // Either way the user is dropped at a position they never left.
    if (!armedRef.current.read) {
      armedRef.current = { read: true, key: takeArmedListScrollKey() };
    }
    if (restoredRef.current || !ready || container == null) {
      return;
    }
    restoredRef.current = true;
    if (armedRef.current.key !== listKey) {
      return;
    }
    const position = readListScroll(listKey);
    // The row check exists for `restoredPositionRef`, not for the
    // scroll: on an empty container the browser clamps scrollTop to 0
    // regardless. Keeping a position the list never applied out of
    // that ref is what stops the re-anchor effect below from replaying
    // it against rows that arrive later, should the breakpoint then
    // flip. The empty list still counts as restored (above), so the
    // write on the way out replaces the stale entry rather than
    // leaving it for a later visit.
    if (position == null || anchorRows(container).length === 0) {
      return;
    }
    scrollTo(container, () => restoreListScroll(container, position));
    restoredPositionRef.current = position;
  }, [ready, listKey, container]);

  // Re-anchor when the row layout changes under a restore the user
  // has not touched yet.
  //
  // `SidebarProvider` resolves its mobile breakpoint in a passive
  // effect, so the first client render is always the desktop one, and
  // `VideoRow` renders a structurally different row per branch. On a
  // phone that means the restore above runs against desktop row
  // heights, and the corrected heights land a beat later — leaving
  // the user off by the accumulated difference of every row above the
  // anchor. Re-applying the same anchor against the new heights puts
  // them back on the row they were reading.
  //
  // Only while the position is still ours. Once the user has scrolled
  // — a breakpoint they crossed by resizing the window, say — being
  // yanked back to a remembered offset is worse than the drift, so
  // the scroll handler below retires the position for good.
  const previousLayoutKeyRef = useRef(layoutKey);
  useLayoutEffect(() => {
    if (previousLayoutKeyRef.current === layoutKey) {
      return;
    }
    previousLayoutKeyRef.current = layoutKey;
    const position = restoredPositionRef.current;
    if (position == null || container == null) {
      return;
    }
    scrollTo(container, () => restoreListScroll(container, position));
  }, [layoutKey, container]);

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
    // The remembered position belonged to the outgoing list; applying
    // it to this one would anchor a row that is no longer there.
    restoredPositionRef.current = null;
    if (container != null) {
      scrollTo(container, () => {
        container.scrollTop = 0;
      });
    }
  }, [listKey, container]);

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
    if (container == null) {
      return;
    }

    // One property read per scroll event — no measuring, no storage.
    // It keeps a usable offset around in case the container is
    // already detached when we come to persist, which would otherwise
    // cost us the position entirely, and it retires the restored
    // position the moment the scroll came from the user rather than
    // from us.
    const onScroll = () => {
      lastOffsetRef.current = container.scrollTop;
      if (container.scrollTop !== ownOffsetRef.current) {
        restoredPositionRef.current = null;
      }
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
  }, [container]);

  return containerRef;
}
