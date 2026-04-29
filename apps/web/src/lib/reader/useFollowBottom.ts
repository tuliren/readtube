'use client';

import { useEffect, useRef } from 'react';

import { findScrollableAncestor } from './findScrollableAncestor';

/** Distance from the bottom (in CSS pixels) within which we still
 *  consider the user to be "following" the stream. A small tolerance
 *  absorbs sub-pixel rounding without being so wide that scrolling
 *  feels stuck. */
const BOTTOM_THRESHOLD_PX = 32;

/**
 * Auto-scrolls the nearest scrollable ancestor to the bottom whenever
 * `deps` change while `active` is true. Stops following the moment
 * the user scrolls away from the bottom; resumes if they scroll back
 * within `BOTTOM_THRESHOLD_PX`. Returns a ref the caller attaches to
 * any element inside the scroll container — the hook walks up from
 * there to discover the scroller.
 */
export function useFollowBottom(active: boolean, deps: ReadonlyArray<unknown>) {
  const anchorRef = useRef<HTMLDivElement>(null);
  const scrollerRef = useRef<HTMLElement | null>(null);
  const followingRef = useRef(true);

  // Locate the scroll ancestor + attach a scroll listener for the
  // duration of the active window. Re-runs only when active flips.
  useEffect(() => {
    if (!active) {
      return;
    }
    const anchor = anchorRef.current;
    if (anchor == null) {
      return;
    }
    const scroller = findScrollableAncestor(anchor);
    if (scroller == null) {
      return;
    }
    scrollerRef.current = scroller;
    followingRef.current = true;

    const onScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = scroller;
      const distFromBottom = scrollHeight - clientHeight - scrollTop;
      // Crucially also true after our own programmatic scrollTo:
      // we land at distFromBottom ≈ 0, so following stays on. The
      // only thing that flips it off is a user gesture moving the
      // viewport more than the threshold.
      followingRef.current = distFromBottom <= BOTTOM_THRESHOLD_PX;
    };
    scroller.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      scroller.removeEventListener('scroll', onScroll);
      scrollerRef.current = null;
    };
  }, [active]);

  // Scroll-to-bottom on every dep change while following. Use
  // `behavior: 'auto'` (instant) so high-frequency streaming updates
  // don't queue up smooth-scroll animations and lag behind.
  useEffect(() => {
    if (!active) {
      return;
    }
    if (!followingRef.current) {
      return;
    }
    const scroller = scrollerRef.current;
    if (scroller == null) {
      return;
    }
    scroller.scrollTo({ top: scroller.scrollHeight });
    // Caller-supplied deps drive the scroll; `active` is read above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, ...deps]);

  return anchorRef;
}
