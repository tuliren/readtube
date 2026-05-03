'use client';

import { ArrowDownIcon, ArrowUpIcon } from '@heroicons/react/24/outline';
import { useEffect, useState } from 'react';

import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { findScrollableAncestor } from '@/lib/reader/findScrollableAncestor';

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

/** Pixel gap required between the article's right edge and the scroll
 *  container's inner right edge before the *full* ladder is willing to
 *  render. Covers the ladder's worst-case width (the w-6 active bar
 *  ≈ 24px) plus the TOC's right padding (32px) plus a small breathing
 *  buffer so the bars don't press against the article text. Below this
 *  the component falls back to the compact tap-to-open-drawer mode
 *  rather than hiding. */
const TOC_MIN_GUTTER_PX = 80;

/** Distance between the full ladder's right edge and the scroll
 *  container's inner right edge (i.e. just left of the main
 *  scrollbar). */
const TOC_RIGHT_INSET_PX = 32;

/** Distance between the compact ladder's right edge and the scroll
 *  container's inner right edge. Smaller than the full-mode inset
 *  because the compact bars are designed to live inside the article's
 *  right padding zone on narrow viewports. */
const TOC_COMPACT_RIGHT_INSET_PX = 8;

/**
 * Notion-style floating table of contents. Two layouts:
 *
 *   - Full (when the gutter next to the article is wide enough):
 *     a vertical ladder of short bars on the right with the active
 *     bar drawn longer + darker. Hover swaps the ladder for a popup
 *     panel listing every entry with Top/Bottom shortcuts.
 *
 *   - Compact (when the gutter is narrow — small viewports, notes
 *     panel open at a wide width, etc.): a tighter ladder of even
 *     shorter bars that sits inside the article's right padding zone.
 *     Tap opens a bottom Sheet drawer with the same Top/Bottom +
 *     entries list, since the hover-popup affordance doesn't work on
 *     touch devices and would also overflow a narrow viewport.
 *
 * Active-item tracking uses IntersectionObserver against the viewport —
 * the reader's scroll container fills the viewport, so visible elements
 * are what the user is actually looking at.
 */
export default function FloatingToc({ items, variant }: Props) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [hasRoom, setHasRoom] = useState(true);
  // Distance (in px) from the viewport's right edge to the scroll
  // container's inner-right (i.e. just left of its scrollbar). The TOC's
  // CSS `right` is anchored to this so the ladder always sits inside the
  // scroller — when the notes side panel opens and shrinks the
  // scroller, the TOC moves left to stay clear of the panel instead of
  // overlapping it. `null` means we haven't measured yet (server render
  // or before the first effect run); the render falls back to a
  // viewport-relative offset so the ladder still appears in roughly the
  // right place during that first frame.
  const [scrollerRightInset, setScrollerRightInset] = useState<number | null>(null);
  // Compact-mode drawer open/close. Only meaningful when `hasRoom`
  // is false; in full mode the popup is hover-driven and ignores
  // this flag.
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Reset the drawer when the layout swaps back to full mode. Without
  // this, a user could open the drawer in compact mode (e.g. notes
  // panel taking up most of the row), close the notes panel so the
  // gutter widens and we re-mount in full mode, then re-open the
  // notes panel later — the compact branch would re-mount with
  // `drawerOpen` still `true` and pop the bottom sheet open without
  // any user gesture.
  useEffect(() => {
    if (hasRoom) {
      setDrawerOpen(false);
    }
  }, [hasRoom]);

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
    // the known-good TOC targets. Used by the gutter measurement below;
    // the Top / Bottom click handlers re-locate the scroller at click
    // time (not via a cached ref) so soft-navigation between videos and
    // tab switches can't strand them on a stale element.
    const scroller = findScrollableAncestor(targets[0]);

    // Watch the gutter between the article and the scroll container's
    // right edge. When the gutter narrows past the full-mode threshold
    // we switch to the compact ladder + drawer instead of hiding. Uses
    // a ResizeObserver so we track *element* size changes, which also
    // covers window resizes without a separate listener.
    const probe = targets[0];
    let measureHandle: number | null = null;
    const measure = () => {
      measureHandle = null;
      if (scroller == null) {
        setHasRoom(true);
        setScrollerRightInset(null);
        return;
      }
      const probeRight = probe.getBoundingClientRect().right;
      const scrollerRect = scroller.getBoundingClientRect();
      // `clientWidth` excludes the scrollbar, so left + clientWidth
      // lands exactly on the inner right edge — where we want the TOC's
      // right side to sit. Without this, anchoring to the bounding
      // rect's `right` would push the ladder under the scrollbar.
      const innerRight = scrollerRect.left + scroller.clientWidth;
      setHasRoom(innerRight - probeRight >= TOC_MIN_GUTTER_PX);
      setScrollerRightInset(Math.max(0, window.innerWidth - innerRight));
    };
    // ResizeObserver can fire mid-layout — defer the measurement to
    // the next frame so `getBoundingClientRect` reads consistent
    // numbers for both elements in the same tick.
    const scheduleMeasure = () => {
      if (measureHandle != null) {
        return;
      }
      measureHandle = window.requestAnimationFrame(measure);
    };
    measure();
    const resizeObserver = scroller != null ? new ResizeObserver(scheduleMeasure) : null;
    resizeObserver?.observe(probe);
    if (scroller != null) {
      resizeObserver?.observe(scroller);
    }

    return () => {
      observer.disconnect();
      resizeObserver?.disconnect();
      if (measureHandle != null) {
        window.cancelAnimationFrame(measureHandle);
      }
    };
  }, [items]);

  // A single-item TOC is noise — nothing to navigate to.
  if (items.length < 2) {
    return null;
  }

  const handleItemClick = (id: string) => {
    const el = document.getElementById(id);
    if (el == null) {
      return;
    }
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  // Re-locate the scroll container at click time (rather than reading a
  // cached ref) so the handlers stay correct across soft-navigation
  // between videos, tab switches that re-mount the article subtree, and
  // any future layout that wraps the reader in a different scroll
  // ancestor. Walks up from the first known-good TOC target so we land
  // on the same container the items effect uses.
  const findScroller = (): HTMLElement | null => {
    if (items.length === 0) {
      return null;
    }
    const probe = document.getElementById(items[0].id);
    if (probe == null) {
      return null;
    }
    return findScrollableAncestor(probe);
  };

  const handleScrollToTop = () => {
    const scroller = findScroller();
    if (scroller == null) {
      return;
    }
    scroller.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleScrollToBottom = () => {
    const scroller = findScroller();
    if (scroller == null) {
      return;
    }
    scroller.scrollTo({ top: scroller.scrollHeight, behavior: 'smooth' });
  };

  // Shared item rows used by both the hover popup (full mode) and the
  // bottom drawer (compact mode). `onAfterPick` lets the drawer close
  // itself on tap without each row needing its own onClose plumbing.
  const renderItems = (onAfterPick?: () => void) =>
    items.map((it) => {
      const isActive = activeId === it.id;
      const indent = it.level === 3 ? 'ml-3' : '';
      return (
        <li key={it.id} className={indent}>
          <button
            type="button"
            onClick={() => {
              handleItemClick(it.id);
              onAfterPick?.();
            }}
            className={`w-full rounded-md px-3 py-2 text-left transition-colors hover:bg-foreground/5 dark:hover:bg-foreground/10 ${
              isActive ? 'font-medium text-blue-600 dark:text-blue-400' : 'text-foreground'
            }`}
          >
            {variant === 'timestamps' ? (
              <span className="flex items-baseline gap-2">
                <span className="shrink-0 font-mono text-xs text-muted-foreground">{it.label}</span>
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
    });

  // Top / Bottom shortcut buttons. Used as `<li>` rows in the popup
  // (so they slot into a single ladder of entries) and as bare
  // `<button>` cells in the drawer's 50/50 grid (so each shortcut
  // gets a full half-row tap target).
  const topBottomButtonClass =
    'flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground dark:hover:bg-foreground/10';
  const renderTopButton = (onAfterPick?: () => void) => (
    <button
      type="button"
      onClick={() => {
        handleScrollToTop();
        onAfterPick?.();
      }}
      className={topBottomButtonClass}
    >
      <ArrowUpIcon className="h-3.5 w-3.5 shrink-0" />
      <span>Top</span>
    </button>
  );
  const renderBottomButton = (onAfterPick?: () => void) => (
    <button
      type="button"
      onClick={() => {
        handleScrollToBottom();
        onAfterPick?.();
      }}
      className={topBottomButtonClass}
    >
      <ArrowDownIcon className="h-3.5 w-3.5 shrink-0" />
      <span>Bottom</span>
    </button>
  );

  if (!hasRoom) {
    // Compact mode: short bars hugging the scroll container's inner
    // right edge, with a single tap target that opens a bottom drawer
    // listing every entry. The whole ladder is one button so the user
    // can hit any bar to bring up the same drawer — distinguishing
    // per-bar taps would demand pixel-perfect aim on hitboxes that are
    // already only a few pixels wide.
    const compactRightStyle =
      scrollerRightInset != null
        ? scrollerRightInset + TOC_COMPACT_RIGHT_INSET_PX
        : TOC_COMPACT_RIGHT_INSET_PX;
    return (
      <>
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          aria-label="Open table of contents"
          className="fixed top-40 z-20 cursor-pointer p-1"
          style={{ right: compactRightStyle }}
        >
          <span className="flex flex-col items-end gap-1.5">
            {items.map((it) => (
              <span
                key={it.id}
                className={`block h-[2px] transition-all ${
                  activeId === it.id ? 'w-3 bg-foreground' : 'w-2 bg-foreground/25'
                }`}
              />
            ))}
          </span>
        </button>
        <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
          <SheetContent
            side="bottom"
            className="flex max-h-[70vh] flex-col gap-0 p-0"
            aria-describedby={undefined}
          >
            <div className="flex items-center gap-2 border-b border-border px-4 py-3">
              <SheetTitle className="text-sm font-semibold">Table of contents</SheetTitle>
            </div>
            {/* Top + Bottom share the row 50/50 above the entries.
                Pulling them out of the entry list means the user can
                jump to either end without first scrolling past the
                full list of headings — important on long videos
                where the drawer is already at its 70vh max-height. */}
            <div className="grid grid-cols-2 gap-1 border-b border-border px-2 py-2 text-sm">
              {renderTopButton(() => setDrawerOpen(false))}
              {renderBottomButton(() => setDrawerOpen(false))}
            </div>
            <ul className="flex-1 overflow-y-auto px-2 py-2 text-sm">
              {renderItems(() => setDrawerOpen(false))}
            </ul>
          </SheetContent>
        </Sheet>
      </>
    );
  }

  // Anchor the ladder to the scroll container's inner right edge plus a
  // fixed inset so the bars always sit inside the scrollable area,
  // regardless of how wide the notes side panel currently is. Falls
  // back to a viewport-relative inset for the first render frame, when
  // we haven't measured yet.
  const rightStyle =
    scrollerRightInset != null ? scrollerRightInset + TOC_RIGHT_INSET_PX : TOC_RIGHT_INSET_PX;

  return (
    <div
      className="group fixed top-40 z-20 block"
      style={{ right: rightStyle }}
      aria-label="Table of contents"
    >
      {/* Ladder (idle). Fades out on hover so the popup visually
          replaces it without the two overlapping. */}
      <div className="flex flex-col items-end gap-2 py-1.5 transition-opacity duration-150 group-hover:pointer-events-none group-hover:opacity-0">
        {items.map((it) => (
          <button
            key={it.id}
            type="button"
            onClick={() => handleItemClick(it.id)}
            aria-label={`Jump to ${it.label}`}
            className={`h-[2px] transition-all ${
              activeId === it.id
                ? 'w-6 bg-foreground'
                : 'w-4 bg-foreground/20 hover:bg-foreground/40'
            }`}
          />
        ))}
      </div>
      {/* Popup (hover). Pointer-events flip from none → auto on hover
          so clicks land, and so the popup doesn't eat hits over the
          article when idle. */}
      <div className="pointer-events-none absolute top-0 right-0 w-64 rounded-xl border border-border bg-background p-2 opacity-0 shadow-lg transition-opacity duration-150 group-hover:pointer-events-auto group-hover:opacity-100">
        <ul className="flex max-h-[70vh] flex-col gap-0.5 overflow-y-auto text-sm">
          <li>{renderTopButton()}</li>
          {renderItems()}
          <li>{renderBottomButton()}</li>
        </ul>
      </div>
    </div>
  );
}
