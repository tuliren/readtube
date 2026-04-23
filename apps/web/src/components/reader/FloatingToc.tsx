'use client';

import { ArrowUpIcon } from '@heroicons/react/24/outline';
import { useEffect, useRef, useState } from 'react';

export interface TocItem {
  /** DOM id of the target anchor. */
  id: string;
  /** Primary label — heading text for articles, timestamp for transcript. */
  label: string;
  /** Transcript-only: first three characters of the paragraph shown next
   *  to the timestamp when the popup is open. */
  secondaryLabel?: string;
  /** Article-only: heading level (2 or 3) used to indent h3 items. */
  level?: 2 | 3;
}

interface Props {
  items: TocItem[];
  variant: 'headings' | 'timestamps';
}

/**
 * Notion-style floating table of contents. Two visual states:
 *   - Idle: a vertical ladder of short bars, one per TOC item, with the
 *     currently-viewed bar drawn longer and darker.
 *   - Hover: a popup panel with the full label list (heading text for
 *     articles, timestamp + first three characters for transcript).
 *
 * Active-item tracking uses IntersectionObserver against the viewport —
 * the reader's scroll container fills the viewport, so visible elements
 * are what the user is actually looking at. Hidden below the compact
 * breakpoint that swaps the reader into its small-screen layout —
 * there's room for the ladder on every wider viewport.
 */
/** Scroll distance (px) past which the back-to-top affordance appears.
 *  Kept small — "not at the top" should really mean "not at the top",
 *  not "somewhere in the middle". A few tens of pixels of slack
 *  avoids flickering the button during elastic-scroll bounce. */
const BACK_TO_TOP_THRESHOLD_PX = 40;

/** Walks up the DOM from a tracked element until it finds an ancestor
 *  whose computed `overflow-y` declares it scrollable. Deliberately
 *  does NOT compare `scrollHeight > clientHeight` — that test is
 *  racy during streaming content updates, and any `overflow: auto`
 *  container that becomes scrollable later will start firing scroll
 *  events we already care about. The reader's scroll container is a
 *  flex child, not `window` or `document.scrollingElement`, so this
 *  sniff is how we discover it from here. */
function findScrollableAncestor(el: HTMLElement): HTMLElement | null {
  let current = el.parentElement;
  while (current != null) {
    const { overflowY } = window.getComputedStyle(current);
    if (overflowY === 'auto' || overflowY === 'scroll') {
      return current;
    }
    current = current.parentElement;
  }
  return null;
}

export default function FloatingToc({ items, variant }: Props) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [showBackToTop, setShowBackToTop] = useState(false);
  const scrollerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (items.length === 0) {
      return;
    }
    const targets = items
      .map((it) => document.getElementById(it.id))
      .filter((el): el is HTMLElement => el != null);
    if (targets.length === 0) {
      return;
    }

    // Track every target's visibility; surface the topmost visible one
    // as the active entry so the ladder highlight lines up with the
    // heading the reader is currently looking at.
    const visible = new Set<string>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            visible.add(entry.target.id);
          } else {
            visible.delete(entry.target.id);
          }
        }
        const first = items.find((it) => visible.has(it.id));
        if (first != null) {
          setActiveId(first.id);
        }
      },
      {
        // Bias the "active" band to the top quarter of the viewport —
        // an element counts as in-view once it passes that line, which
        // matches how readers actually track where they are.
        rootMargin: '-20% 0px -60% 0px',
        threshold: 0,
      }
    );
    for (const t of targets) {
      observer.observe(t);
    }

    // Locate the reader's scroll container by walking up from one of
    // the known-good TOC targets and cache it on a ref so the click
    // handler can reuse it without another DOM walk.
    const scroller = findScrollableAncestor(targets[0]);
    scrollerRef.current = scroller;

    const updateScrolled = () => {
      if (scroller == null) {
        return;
      }
      setShowBackToTop(scroller.scrollTop > BACK_TO_TOP_THRESHOLD_PX);
    };
    updateScrolled();
    scroller?.addEventListener('scroll', updateScrolled, { passive: true });

    return () => {
      observer.disconnect();
      scroller?.removeEventListener('scroll', updateScrolled);
    };
  }, [items]);

  // A single-item TOC is noise — nothing to navigate to.
  if (items.length < 2) {
    return null;
  }

  const handleClick = (id: string) => {
    const el = document.getElementById(id);
    if (el == null) {
      return;
    }
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handleBackToTop = () => {
    scrollerRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div
      className="group fixed top-40 right-8 z-20 hidden sidebar:block"
      aria-label="Table of contents"
    >
      {/* Ladder (idle). Fades out on hover so the popup visually
          replaces it without the two overlapping. */}
      <div className="flex flex-col items-end gap-2 py-1.5 transition-opacity duration-150 group-hover:pointer-events-none group-hover:opacity-0">
        {items.map((it) => (
          <button
            key={it.id}
            type="button"
            onClick={() => handleClick(it.id)}
            aria-label={`Jump to ${it.label}`}
            className={`h-[2px] transition-all ${
              activeId === it.id
                ? 'w-6 bg-foreground'
                : 'w-4 bg-foreground/20 hover:bg-foreground/40'
            }`}
          />
        ))}
        {showBackToTop && (
          <button
            type="button"
            onClick={handleBackToTop}
            aria-label="Back to top"
            title="Back to top"
            className="mt-2 rounded-full p-1 text-foreground/40 transition-colors hover:bg-foreground/5 hover:text-foreground"
          >
            <ArrowUpIcon className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      {/* Popup (hover). Pointer-events flip from none → auto on hover
          so clicks land, and so the popup doesn't eat hits over the
          article when idle. */}
      <div className="pointer-events-none absolute top-0 right-0 w-64 rounded-xl border border-border bg-background p-2 opacity-0 shadow-lg transition-opacity duration-150 group-hover:pointer-events-auto group-hover:opacity-100">
        <ul className="flex max-h-[70vh] flex-col gap-0.5 overflow-y-auto text-sm">
          {items.map((it) => {
            const isActive = activeId === it.id;
            const indent = it.level === 3 ? 'ml-3' : '';
            return (
              <li key={it.id} className={indent}>
                <button
                  type="button"
                  onClick={() => handleClick(it.id)}
                  className={`w-full rounded-md px-3 py-2 text-left transition-colors hover:bg-foreground/5 dark:hover:bg-foreground/10 ${
                    isActive ? 'font-medium text-blue-600 dark:text-blue-400' : 'text-foreground'
                  }`}
                >
                  {variant === 'timestamps' ? (
                    <span className="flex items-baseline gap-2">
                      <span className="shrink-0 font-mono text-xs text-muted-foreground">
                        {it.label}
                      </span>
                      {/* min-w-0 is what actually lets `truncate` take
                          effect inside a flex row — otherwise the span
                          keeps its content width and nothing gets
                          clipped. The secondaryLabel can carry up to
                          50 words; the ellipsis cuts it to whatever
                          fits the popup width. */}
                      <span className="min-w-0 flex-1 truncate">{it.secondaryLabel}</span>
                    </span>
                  ) : (
                    <span className="line-clamp-2">{it.label}</span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
