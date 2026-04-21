'use client';

import {
  Archive,
  Bookmark,
  BookmarkCheck,
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
import { formatDurationSeconds } from '@/lib/format/duration';
import type { VideoData } from '@/lib/types';

import { useSidebar } from './SidebarContext';
import VideoLibraryMenuItems from './VideoLibraryMenuItems';
import { useTriage } from './useTriage';

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
      <span
        className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-1.5 py-0 text-[10px] font-medium text-amber-700"
        title="This video has no captions, so no transcript / summary / article can be produced."
      >
        No transcript
      </span>
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

function ArtifactDot({
  label,
  present,
  title,
}: {
  label: string;
  present: boolean;
  title: string;
}) {
  const presentClasses = 'border-blue-200 bg-blue-50 text-blue-700';
  const absentClasses = 'border-gray-200 bg-white text-gray-300';
  return (
    <span
      title={`${title}: ${present ? 'generated' : 'not generated yet'}`}
      className={`inline-flex h-4 w-4 items-center justify-center rounded-full border text-[9px] font-semibold ${
        present ? presentClasses : absentClasses
      }`}
    >
      {label}
    </span>
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
  async function handleGenerateSummary() {
    if (pendingSummary) {
      return;
    }
    setPendingSummary(true);
    const ok = await triage.generateSummary(video.id);
    if (!ok) {
      setPendingSummary(false);
    }
  }

  async function handleGenerateArticle() {
    if (pendingArticle) {
      return;
    }
    setPendingArticle(true);
    const ok = await triage.generateArticle(video.id);
    if (!ok) {
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
        <img
          // See VideoReader.tsx — Bilibili CDN 403s with our Referer
          // and returns http:// URLs that would otherwise be blocked.
          src={video.thumbnailUrl.replace(/^http:\/\//, 'https://')}
          alt=""
          className="mt-0.5 h-12 w-[80px] shrink-0 rounded object-cover"
          loading="lazy"
          referrerPolicy="no-referrer"
        />
      )}

      <div className="min-w-0 flex-1">
        <p
          className={`truncate text-sm leading-snug ${
            isUnread ? 'font-semibold text-gray-900' : 'font-normal text-gray-600'
          }`}
        >
          {video.title}
        </p>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-gray-400">
          <span>
            {video.channelName}
            {video.publishedAt != null ? ` · ${relativeTime(video.publishedAt, now)}` : null}
            {(() => {
              const duration = formatDurationSeconds(video.durationSeconds);
              return duration != null ? ` · ${duration}` : null;
            })()}
          </span>
          <ArtifactBadges video={video} />
        </div>
        {video.description != null && (
          <p className="mt-1 line-clamp-1 text-xs text-gray-400">{video.description}</p>
        )}
      </div>
    </>
  );

  return (
    <li className="group">
      <div
        className={`flex items-start gap-2 px-4 py-3 transition-colors ${
          isSelected ? 'bg-blue-50' : isChecked ? 'bg-blue-50/50' : 'hover:bg-gray-50'
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
                    className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
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
                  <DropdownMenuItem onSelect={() => onOpenNotes(video.id, video.title)}>
                    <NotebookPen className="mr-2 h-4 w-4 text-amber-500" />
                    {video.noteCount > 0 ? `Notes (${video.noteCount})` : 'Add note'}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() => void triage.toggleStar(video.id, video.isStarred)}
                  >
                    <Star
                      className={`mr-2 h-4 w-4 ${video.isStarred ? 'fill-yellow-400 text-yellow-500' : 'text-gray-400'}`}
                    />
                    {video.isStarred ? 'Unstar' : 'Star'}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() => void triage.toggleSave(video.id, video.isSaved)}
                  >
                    {video.isSaved ? (
                      <BookmarkCheck className="mr-2 h-4 w-4 text-blue-500" />
                    ) : (
                      <Bookmark className="mr-2 h-4 w-4 text-gray-400" />
                    )}
                    {video.isSaved ? 'Unsave' : 'Read Later'}
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => void triage.archive(video.id)}>
                    <Archive className="mr-2 h-4 w-4 text-gray-400" />
                    Archive
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <VideoLibraryMenuItems video={video} showRemove={showRemoveFromLibrary} />
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ) : (
            <div
              className="flex shrink-0 items-center gap-1 opacity-0 group-hover:opacity-100 data-[active=true]:opacity-100"
              data-active={
                video.isStarred ||
                video.isSaved ||
                video.noteCount > 0 ||
                pendingSummary ||
                pendingArticle ||
                moreOpen
              }
            >
              {showGenerateSummary && (
                <button
                  type="button"
                  onClick={(e) => {
                    stop(e);
                    void handleGenerateSummary();
                  }}
                  disabled={pendingSummary}
                  title={pendingSummary ? 'Generating summary…' : 'Generate summary'}
                  aria-label={pendingSummary ? 'Generating summary' : 'Generate summary'}
                  className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-blue-500 disabled:opacity-70"
                >
                  {pendingSummary ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <FileText className="h-4 w-4" />
                  )}
                </button>
              )}
              {showGenerateArticle && (
                <button
                  type="button"
                  onClick={(e) => {
                    stop(e);
                    void handleGenerateArticle();
                  }}
                  disabled={pendingArticle}
                  title={pendingArticle ? 'Generating article…' : 'Generate article'}
                  aria-label={pendingArticle ? 'Generating article' : 'Generate article'}
                  className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-blue-500 disabled:opacity-70"
                >
                  {pendingArticle ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Newspaper className="h-4 w-4" />
                  )}
                </button>
              )}
              {/* Notes button: always opens the inline notes panel in the list view. */}
              <button
                type="button"
                onClick={(e) => {
                  stop(e);
                  onOpenNotes(video.id, video.title);
                }}
                title={
                  video.noteCount > 0
                    ? `${video.noteCount} note${video.noteCount === 1 ? '' : 's'} — open`
                    : 'Add note'
                }
                className={`flex items-center gap-0.5 rounded p-1 hover:bg-gray-100 hover:text-amber-500 ${
                  video.noteCount > 0 ? 'text-amber-500' : 'text-gray-400'
                }`}
                aria-label={
                  video.noteCount > 0
                    ? `Open notes (${video.noteCount})`
                    : `Add note for ${video.title}`
                }
              >
                <NotebookPen className={`h-4 w-4 ${video.noteCount > 0 ? 'fill-amber-100' : ''}`} />
                {video.noteCount > 0 && (
                  <span className="text-[10px] font-semibold leading-none">{video.noteCount}</span>
                )}
              </button>
              <button
                type="button"
                onClick={(e) => {
                  stop(e);
                  void triage.toggleStar(video.id, video.isStarred);
                }}
                title={video.isStarred ? 'Unstar' : 'Star'}
                className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-yellow-500"
              >
                <Star
                  className={`h-4 w-4 ${video.isStarred ? 'fill-yellow-400 text-yellow-500' : ''}`}
                />
              </button>
              <button
                type="button"
                onClick={(e) => {
                  stop(e);
                  void triage.toggleSave(video.id, video.isSaved);
                }}
                title={video.isSaved ? 'Remove from Read Later' : 'Read Later'}
                className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-blue-500"
              >
                {video.isSaved ? (
                  <BookmarkCheck className="h-4 w-4 text-blue-500" />
                ) : (
                  <Bookmark className="h-4 w-4" />
                )}
              </button>
              <button
                type="button"
                onClick={(e) => {
                  stop(e);
                  void triage.archive(video.id);
                }}
                title="Archive"
                className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-red-500"
              >
                <Archive className="h-4 w-4" />
              </button>
              <DropdownMenu open={moreOpen} onOpenChange={setMoreOpen}>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    onClick={stop}
                    title="More actions"
                    aria-label="More actions"
                    className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </button>
                </DropdownMenuTrigger>
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
