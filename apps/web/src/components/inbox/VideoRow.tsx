'use client';

import {
  Archive,
  Bookmark,
  BookmarkCheck,
  Check,
  FileText,
  Loader2,
  MoreHorizontal,
  Newspaper,
  NotebookPen,
  Star,
} from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { formatDurationSeconds } from '@/lib/format/duration';
import type { VideoData } from '@/lib/types';

import { useSidebar } from './SidebarContext';
import VideoLibraryMenuItems from './VideoLibraryMenuItems';
import { useTriage } from './useTriage';

/**
 * Wraps any focusable / hoverable child in a shadcn Tooltip. Replaces
 * the HTML `title` attribute on inline badges and toolbar buttons —
 * `title` is browser-styled, slow to appear, and inconsistent with
 * the rest of the inbox chrome.
 */
function WithTooltip({
  label,
  children,
  side = 'top',
}: {
  label: string;
  children: React.ReactNode;
  side?: 'top' | 'right' | 'bottom' | 'left';
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side={side}>{label}</TooltipContent>
    </Tooltip>
  );
}

/**
 * Tiny presence badges for the AI artifacts attached to a video.
 *
 * Three single-letter pills (T = Transcript, S = Summary, A = Article)
 * sit in the metadata line. Each one is one of three states:
 *
 *   - present  → solid blue, stating the artifact has been generated
 *   - absent   → muted gray outline, indicating "not yet"
 *   - n/a      → only the T pill: the whole row collapses to a single
 *                "No transcript" note when transcript_unavailable is
 *                true, since the other two artifacts are gated on
 *                having a transcript at all
 *
 * The badges are wrapped in spans (not buttons) — they're status,
 * not interactive — and they sit inside the row's `<Link>` so
 * clicking them follows the same navigation as the row body.
 */
function ArtifactBadges({ video }: { video: VideoData }) {
  if (video.transcriptUnavailable) {
    return (
      <WithTooltip label="This video has no captions, so no transcript / summary / article can be produced.">
        <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-1.5 py-0 text-[10px] font-medium text-amber-700">
          No transcript
        </span>
      </WithTooltip>
    );
  }
  // Order matches the reader's tab order (Summary, Article, Transcript)
  // so the same artifact maps to the same position in both surfaces.
  return (
    <span className="inline-flex items-center gap-1">
      <ArtifactDot label="S" present={video.hasSummary} title="Summary" />
      <ArtifactDot label="A" present={video.hasArticle} title="Article" />
      <ArtifactDot label="T" present={video.hasTranscript} title="Transcript" />
    </span>
  );
}

/**
 * Idle-state badges for star / save / notes. Renders inline in the
 * metadata row so the row can advertise its state without forcing
 * the hover toolbar to stay pinned open on every starred or saved
 * video.
 */
function StateBadges({ video }: { video: VideoData }) {
  if (!video.isStarred && !video.isSaved && video.noteCount === 0) {
    return null;
  }
  return (
    <span className="inline-flex items-center gap-1.5">
      {video.isStarred && (
        <WithTooltip label="Starred">
          <span className="inline-flex">
            <Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-500" aria-label="Starred" />
          </span>
        </WithTooltip>
      )}
      {video.isSaved && (
        <WithTooltip label="Saved for later">
          <span className="inline-flex">
            <BookmarkCheck className="h-3.5 w-3.5 text-blue-500" aria-label="Saved" />
          </span>
        </WithTooltip>
      )}
      {video.noteCount > 0 && (
        <WithTooltip label={`${video.noteCount} note${video.noteCount === 1 ? '' : 's'}`}>
          <span className="inline-flex items-center gap-0.5 text-amber-500">
            <NotebookPen className="h-3.5 w-3.5 fill-amber-100" />
            <span className="text-[10px] font-semibold leading-none">{video.noteCount}</span>
          </span>
        </WithTooltip>
      )}
    </span>
  );
}

function ArtifactDot({
  label,
  present,
  title,
}: {
  label: string;
  present: boolean;
  title: string;
}) {
  const presentClasses =
    'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-500/30 dark:bg-blue-500/15 dark:text-blue-300';
  const absentClasses = 'border-border bg-background text-muted-foreground/70';
  return (
    <WithTooltip label={`${title}: ${present ? 'generated' : 'not generated yet'}`}>
      <span
        className={`inline-flex h-4 w-4 items-center justify-center rounded-full border text-[9px] font-semibold ${
          present ? presentClasses : absentClasses
        }`}
      >
        {label}
      </span>
    </WithTooltip>
  );
}

interface Props {
  video: VideoData;
  isSelected: boolean;
  isChecked: boolean;
  onToggleChecked: (id: string, next: boolean, shiftKey?: boolean) => void;
  href: string;
  inSelectionMode: boolean;
  onOpenNotes: (videoId: string, videoTitle: string) => void;
  /** Show an inline "Remove from library" icon in ordinary mode.
   *  Only enabled on the library list views. */
  showRemoveFromLibrary?: boolean;
  /**
   * Client-side `Date.now()` snapshot captured once after mount by the
   * parent list. `null` during SSR and the first client render so we
   * render a stable absolute date and avoid the "3m ago" vs "4m ago"
   * hydration mismatch; the list swaps to relative strings a tick
   * after hydration.
   */
  now: number | null;
}

/**
 * Locale-locked absolute date used for the SSR + first-client-render
 * pass. Server and browser both format through the same `en-US`
 * template so the rendered string is byte-identical.
 */
function absoluteDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function relativeTime(dateStr: string, now: number | null): string {
  if (now == null) {
    return absoluteDate(dateStr);
  }
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMinutes < 1) {
    return 'just now';
  }
  if (diffHours < 1) {
    return `${diffMinutes}m ago`;
  }
  if (diffDays < 1) {
    return `${diffHours}h ago`;
  }
  if (diffDays < 30) {
    return `${diffDays}d ago`;
  }
  return absoluteDate(dateStr);
}

/**
 * One row in the inbox video list. The row hosts:
 * - a multi-select checkbox (shown on hover or when any row is checked)
 * - the unread dot + title + metadata (the clickable link)
 * - star / read-later / archive action icons
 *
 * The action icons are wrapped in buttons that stop propagation so they
 * don't trigger the row's Link navigation.
 *
 * In selection mode (when at least one row is checked), clicking the row
 * body toggles the checkbox instead of navigating to the video. Action
 * icons are hidden in this mode to reduce visual noise. Shift+click
 * range-selects from the last checked row.
 */
export default function VideoRow({
  video,
  isSelected,
  isChecked,
  onToggleChecked,
  href,
  inSelectionMode,
  onOpenNotes,
  now,
  showRemoveFromLibrary,
}: Props) {
  const triage = useTriage();
  const { isMobile } = useSidebar();
  const isUnread = video.readAt == null;

  // Track in-flight generate requests so we can swap the button icon
  // for a spinner. The button stops rendering once the artifact lands
  // on the refreshed video prop — we reset the pending flag in sync with
  // that signal so a later list revalidation that briefly surfaces stale
  // data can't resurrect the spinner after we've already completed.
  const [pendingSummary, setPendingSummary] = useState(false);
  const [pendingArticle, setPendingArticle] = useState(false);
  // Radix portals the dropdown menu, so when it opens the pointer
  // moves off the `.group` row and the hover-only toolbar fades away
  // — dragging every other action button with it. Tracking the open
  // state lets the toolbar's `data-active` pin it visible until the
  // menu closes.
  const [moreOpen, setMoreOpen] = useState(false);

  useEffect(() => {
    if (video.hasSummary) {
      setPendingSummary(false);
    }
  }, [video.hasSummary]);

  useEffect(() => {
    if (video.hasArticle) {
      setPendingArticle(false);
    }
  }, [video.hasArticle]);

  // Generate buttons are only meaningful when a transcript can exist.
  // Skip them for videos we've confirmed have no captions so the row
  // doesn't grow buttons that would immediately 410.
  const canGenerate = !video.transcriptUnavailable;
  const showGenerateSummary = canGenerate && !video.hasSummary;
  const showGenerateArticle = canGenerate && !video.hasArticle;

  // These take no event — callers that need to stop a parent Link / row
  // click (desktop toolbar) wrap the call in `stop(e)`. The mobile
  // dropdown invokes onSelect without forwarding the Radix event so the
  // menu still closes (calling preventDefault on a Radix onSelect Event
  // is the API signal to keep the dropdown open).
  //
  // The `finally` reset is belt-and-suspenders: the server now reports
  // persist failures / empty content via `{ error }` so the hook
  // returns false there, but if the SWR refetch itself fails (network
  // outage right after a successful generate) we'd otherwise be stuck
  // with a spinning, disabled button that never unmounts. Accepting
  // the brief FileText / Newspaper flash between the POST resolving
  // and SWR landing `hasSummary=true` buys the recoverable state.
  async function handleGenerateSummary() {
    if (pendingSummary) {
      return;
    }
    setPendingSummary(true);
    try {
      await triage.generateSummary(video.id);
    } finally {
      setPendingSummary(false);
    }
  }

  async function handleGenerateArticle() {
    if (pendingArticle) {
      return;
    }
    setPendingArticle(true);
    try {
      await triage.generateArticle(video.id);
    } finally {
      setPendingArticle(false);
    }
  }

  // Long-press (mobile): touchstart arms a 500ms timer; if it fires
  // without the finger moving more than LONG_PRESS_SLOP pixels or
  // lifting off, we flip this row into selection mode.
  // `longPressedRef` suppresses the synthetic click that follows
  // touchend so the row doesn't also navigate. Stationary-finger
  // jitter often fires sub-pixel touchmove events, so we require a
  // real movement before cancelling the timer.
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressedRef = useRef(false);
  const touchOriginRef = useRef<{ x: number; y: number } | null>(null);
  const LONG_PRESS_SLOP = 10;

  useEffect(() => {
    // Clear any pending long-press timer if the row unmounts mid-hold
    // (SWR refresh, pagination, navigation). Without this the timer
    // callback fires against a video id that's no longer in view and
    // flips the list into an unexpected selection state.
    return () => {
      if (longPressTimer.current != null) {
        clearTimeout(longPressTimer.current);
        longPressTimer.current = null;
      }
    };
  }, []);

  function stop(e: React.MouseEvent | React.KeyboardEvent) {
    e.preventDefault();
    e.stopPropagation();
  }

  function clearLongPress() {
    if (longPressTimer.current != null) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    touchOriginRef.current = null;
  }

  function handleTouchStart(e: React.TouchEvent) {
    if (inSelectionMode || !isMobile) {
      return;
    }
    longPressedRef.current = false;
    clearLongPress();
    const touch = e.touches[0];
    touchOriginRef.current = touch != null ? { x: touch.clientX, y: touch.clientY } : null;
    longPressTimer.current = setTimeout(() => {
      longPressedRef.current = true;
      if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
        navigator.vibrate(15);
      }
      onToggleChecked(video.id, true);
    }, 500);
  }

  function handleTouchMove(e: React.TouchEvent) {
    const origin = touchOriginRef.current;
    if (origin == null) {
      return;
    }
    const touch = e.touches[0];
    if (touch == null) {
      return;
    }
    const dx = touch.clientX - origin.x;
    const dy = touch.clientY - origin.y;
    if (dx * dx + dy * dy > LONG_PRESS_SLOP * LONG_PRESS_SLOP) {
      clearLongPress();
    }
  }

  function handleRowClick(e: React.MouseEvent) {
    if (longPressedRef.current) {
      e.preventDefault();
      e.stopPropagation();
      longPressedRef.current = false;
      return;
    }
    if (inSelectionMode) {
      e.preventDefault();
      e.stopPropagation();
      onToggleChecked(video.id, !isChecked, e.shiftKey);
    }
  }

  const rowContent = (
    <>
      {isUnread ? (
        <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-blue-600" />
      ) : (
        <span className="mt-1.5 h-2 w-2 shrink-0" />
      )}

      {video.thumbnailUrl != null && (
        // self-stretch makes the wrapper match the three-line text column's
        // height, and the absolutely-positioned image fills it via
        // object-cover. Stretching a div (not the <img>, a replaced element
        // with its own intrinsic height) keeps the thumbnail from ever
        // driving the row taller than the text — so it covers the row with
        // no dead space on either side.
        <div className="relative w-24 shrink-0 self-stretch overflow-hidden rounded">
          <img
            // See VideoReader.tsx — Bilibili CDN 403s with our Referer
            // and returns http:// URLs that would otherwise be blocked.
            src={video.thumbnailUrl.replace(/^http:\/\//, 'https://')}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
            loading="lazy"
            referrerPolicy="no-referrer"
          />
        </div>
      )}

      <div className="min-w-0 flex-1">
        {/* Three stacked lines beside the thumbnail: bold title, then
            author / time / duration, then the artifact + state badges.
            The blue dot (rendered above) is the sole unread indicator. */}
        <p className="truncate text-sm font-semibold leading-snug text-foreground">{video.title}</p>

        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          {video.channelName}
          {video.publishedAt != null ? ` · ${relativeTime(video.publishedAt, now)}` : null}
          {(() => {
            const duration = formatDurationSeconds(video.durationSeconds);
            return duration != null ? ` · ${duration}` : null;
          })()}
        </p>

        <div className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1">
          <ArtifactBadges video={video} />
          <StateBadges video={video} />
        </div>
      </div>
    </>
  );

  return (
    <li className="group">
      <div
        className={`relative flex items-start gap-2 px-4 py-3 transition-colors ${
          isSelected
            ? 'bg-blue-50 dark:bg-blue-500/15'
            : isChecked
              ? 'bg-blue-50/50 dark:bg-blue-500/10'
              : 'hover:bg-muted'
        } ${inSelectionMode ? 'select-none' : ''}`}
      >
        <div
          className={`pt-1 ${inSelectionMode || isChecked ? '' : 'hidden sidebar:block'}`}
          onClick={(e) => {
            stop(e);
            onToggleChecked(video.id, !isChecked, e.shiftKey);
          }}
          role="presentation"
        >
          <Checkbox
            checked={isChecked}
            // Click is handled by the wrapper div so we can read shiftKey
            // for range selection. Prevent the default toggle here.
            onCheckedChange={() => {}}
            aria-label={`Select ${video.title}`}
            className={`pointer-events-none ${isChecked || inSelectionMode ? '' : 'opacity-0 group-hover:opacity-100'}`}
          />
        </div>

        {inSelectionMode ? (
          <div
            className="flex min-w-0 flex-1 cursor-pointer items-start gap-2"
            onClick={handleRowClick}
            role="button"
            tabIndex={0}
          >
            {rowContent}
          </div>
        ) : (
          <Link
            href={href}
            className="flex min-w-0 flex-1 items-start gap-2"
            onClick={handleRowClick}
            onTouchStart={handleTouchStart}
            onTouchEnd={clearLongPress}
            onTouchMove={handleTouchMove}
            onTouchCancel={clearLongPress}
          >
            {rowContent}
          </Link>
        )}

        {!inSelectionMode &&
          (isMobile ? (
            <div
              className="flex shrink-0 items-center"
              data-active={video.isStarred || video.isSaved || video.noteCount > 0}
            >
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    onClick={(e) => e.stopPropagation()}
                    className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                    aria-label="Actions"
                  >
                    {pendingSummary || pendingArticle ? (
                      <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
                    ) : (
                      <MoreHorizontal className="h-4 w-4" />
                    )}
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44">
                  {showGenerateSummary && (
                    <DropdownMenuItem
                      disabled={pendingSummary}
                      onSelect={() => void handleGenerateSummary()}
                    >
                      {pendingSummary ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin text-blue-500" />
                      ) : (
                        <FileText className="mr-2 h-4 w-4 text-blue-500" />
                      )}
                      {pendingSummary ? 'Generating…' : 'Generate summary'}
                    </DropdownMenuItem>
                  )}
                  {showGenerateArticle && (
                    <DropdownMenuItem
                      disabled={pendingArticle}
                      onSelect={() => void handleGenerateArticle()}
                    >
                      {pendingArticle ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin text-blue-500" />
                      ) : (
                        <Newspaper className="mr-2 h-4 w-4 text-blue-500" />
                      )}
                      {pendingArticle ? 'Generating…' : 'Generate article'}
                    </DropdownMenuItem>
                  )}
                  {isUnread && (
                    <DropdownMenuItem onSelect={() => void triage.markRead(video.id)}>
                      <Check className="mr-2 h-4 w-4 text-emerald-500" />
                      Mark as read
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem onSelect={() => onOpenNotes(video.id, video.title)}>
                    <NotebookPen className="mr-2 h-4 w-4 text-amber-500" />
                    {video.noteCount > 0 ? `Notes (${video.noteCount})` : 'Add note'}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() => void triage.toggleStar(video.id, video.isStarred)}
                  >
                    <Star
                      className={`mr-2 h-4 w-4 ${video.isStarred ? 'fill-yellow-400 text-yellow-500' : 'text-muted-foreground'}`}
                    />
                    {video.isStarred ? 'Unstar' : 'Star'}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() => void triage.toggleSave(video.id, video.isSaved)}
                  >
                    {video.isSaved ? (
                      <BookmarkCheck className="mr-2 h-4 w-4 text-blue-500" />
                    ) : (
                      <Bookmark className="mr-2 h-4 w-4 text-muted-foreground" />
                    )}
                    {video.isSaved ? 'Unsave' : 'Read Later'}
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => void triage.archive(video.id)}>
                    <Archive className="mr-2 h-4 w-4 text-muted-foreground" />
                    Archive
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <VideoLibraryMenuItems video={video} showRemove={showRemoveFromLibrary} />
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ) : (
            <div
              className="pointer-events-none absolute right-4 top-2 flex shrink-0 items-center gap-1 rounded-md bg-background/80 px-1 py-0.5 opacity-0 shadow-sm ring-1 ring-border/50 backdrop-blur-sm transition-opacity group-hover:pointer-events-auto group-hover:opacity-100 data-[active=true]:pointer-events-auto data-[active=true]:opacity-100 dark:bg-background/70"
              data-active={pendingSummary || pendingArticle || moreOpen}
            >
              {showGenerateSummary && (
                <WithTooltip label={pendingSummary ? 'Generating summary…' : 'Generate summary'}>
                  <button
                    type="button"
                    onClick={(e) => {
                      stop(e);
                      void handleGenerateSummary();
                    }}
                    disabled={pendingSummary}
                    aria-label={pendingSummary ? 'Generating summary' : 'Generate summary'}
                    className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-blue-500 disabled:opacity-70"
                  >
                    {pendingSummary ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <FileText className="h-4 w-4" />
                    )}
                  </button>
                </WithTooltip>
              )}
              {showGenerateArticle && (
                <WithTooltip label={pendingArticle ? 'Generating article…' : 'Generate article'}>
                  <button
                    type="button"
                    onClick={(e) => {
                      stop(e);
                      void handleGenerateArticle();
                    }}
                    disabled={pendingArticle}
                    aria-label={pendingArticle ? 'Generating article' : 'Generate article'}
                    className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-blue-500 disabled:opacity-70"
                  >
                    {pendingArticle ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Newspaper className="h-4 w-4" />
                    )}
                  </button>
                </WithTooltip>
              )}
              {/* Notes button: always opens the inline notes panel in the list view. */}
              <WithTooltip
                label={
                  video.noteCount > 0
                    ? `${video.noteCount} note${video.noteCount === 1 ? '' : 's'} — open`
                    : 'Add note'
                }
              >
                <button
                  type="button"
                  onClick={(e) => {
                    stop(e);
                    onOpenNotes(video.id, video.title);
                  }}
                  className={`flex items-center gap-0.5 rounded p-1 hover:bg-accent hover:text-amber-500 ${
                    video.noteCount > 0 ? 'text-amber-500' : 'text-muted-foreground'
                  }`}
                  aria-label={
                    video.noteCount > 0
                      ? `Open notes (${video.noteCount})`
                      : `Add note for ${video.title}`
                  }
                >
                  <NotebookPen
                    className={`h-4 w-4 ${video.noteCount > 0 ? 'fill-amber-100' : ''}`}
                  />
                  {video.noteCount > 0 && (
                    <span className="text-[10px] font-semibold leading-none">
                      {video.noteCount}
                    </span>
                  )}
                </button>
              </WithTooltip>
              {isUnread && (
                <WithTooltip label="Mark as read">
                  <button
                    type="button"
                    onClick={(e) => {
                      stop(e);
                      void triage.markRead(video.id);
                    }}
                    aria-label="Mark as read"
                    className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-emerald-500"
                  >
                    <Check className="h-4 w-4" />
                  </button>
                </WithTooltip>
              )}
              <WithTooltip label={video.isStarred ? 'Unstar' : 'Star'}>
                <button
                  type="button"
                  onClick={(e) => {
                    stop(e);
                    void triage.toggleStar(video.id, video.isStarred);
                  }}
                  aria-label={video.isStarred ? 'Unstar' : 'Star'}
                  className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-yellow-500"
                >
                  <Star
                    className={`h-4 w-4 ${video.isStarred ? 'fill-yellow-400 text-yellow-500' : ''}`}
                  />
                </button>
              </WithTooltip>
              <WithTooltip label={video.isSaved ? 'Remove from Read Later' : 'Read Later'}>
                <button
                  type="button"
                  onClick={(e) => {
                    stop(e);
                    void triage.toggleSave(video.id, video.isSaved);
                  }}
                  aria-label={video.isSaved ? 'Remove from Read Later' : 'Read Later'}
                  className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-blue-500"
                >
                  {video.isSaved ? (
                    <BookmarkCheck className="h-4 w-4 text-blue-500" />
                  ) : (
                    <Bookmark className="h-4 w-4" />
                  )}
                </button>
              </WithTooltip>
              <WithTooltip label="Archive">
                <button
                  type="button"
                  onClick={(e) => {
                    stop(e);
                    void triage.archive(video.id);
                  }}
                  aria-label="Archive"
                  className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-red-500"
                >
                  <Archive className="h-4 w-4" />
                </button>
              </WithTooltip>
              <DropdownMenu open={moreOpen} onOpenChange={setMoreOpen}>
                <WithTooltip label="More actions">
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      onClick={stop}
                      aria-label="More actions"
                      className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                    >
                      <MoreHorizontal className="h-4 w-4" />
                    </button>
                  </DropdownMenuTrigger>
                </WithTooltip>
                <DropdownMenuContent align="end" className="w-48">
                  <VideoLibraryMenuItems video={video} showRemove={showRemoveFromLibrary} />
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ))}
      </div>
    </li>
  );
}
