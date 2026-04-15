'use client';

import { useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { VideoData } from '@/lib/types';

import BulkActionBar from './BulkActionBar';
import VideoRow from './VideoRow';

interface Props {
  videos: VideoData[];
  selectedVideoId: string | null;
  /** Copy to render when `videos` is empty. The parent owns this so
   *  the message can change with the active filter (Starred → "No
   *  starred videos yet…", channel narrow → "No videos in <name>
   *  yet.", etc.) instead of always saying "No videos yet". */
  emptyMessage: string;
  /** True while the SWR fetch for the current videosUrl is in flight
   *  AND there's no data (cached or SSR-fallback) to show yet.
   *  Distinguishes "still loading" from "loaded but empty" so we
   *  show a skeleton instead of flashing the empty-state copy for
   *  ~100ms on every filter change. */
  isLoading: boolean;
  onOpenNotes: (videoId: string, videoTitle: string) => void;
}

/**
 * Skeleton placeholder rendered while the videos fetch is in flight
 * and we have no cached data to show. Six rows roughly the height
 * of a real VideoRow so the layout doesn't jump when the data
 * resolves. Pulses gently via Tailwind's animate-pulse.
 */
function VideoListSkeleton() {
  return (
    <ul className="divide-y divide-gray-100" aria-busy="true" aria-live="polite">
      {Array.from({ length: 6 }).map((_, i) => (
        <li key={i} className="px-4 py-3">
          <div className="flex items-start gap-3">
            <div className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-gray-200" />
            <div className="min-w-0 flex-1 space-y-2">
              <div className="h-4 w-4/5 animate-pulse rounded bg-gray-200" />
              <div className="h-3 w-1/3 animate-pulse rounded bg-gray-200" />
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

export default function VideoList({
  videos,
  selectedVideoId,
  emptyMessage,
  isLoading,
  onOpenNotes,
}: Props) {
  const searchParams = useSearchParams();

  // Build the "filter context" we want to forward into the reader as
  // a single ?returnTo=<encoded-query> param so the reader's Back
  // button can land back in the exact filtered list.
  //
  // Two cases:
  //   1. We're on `/inbox?starred=1` (or similar) — searchParams IS
  //      the filter context, so use its toString().
  //   2. We're already in the reader at `/inbox/<id>?returnTo=<inner>`
  //      — forward the same `returnTo` value verbatim so navigating
  //      between sibling videos doesn't lose the back-target.
  const filterContext = (() => {
    const returnToInUrl = searchParams.get('returnTo');
    if (returnToInUrl != null) {
      return returnToInUrl;
    }
    return searchParams.toString();
  })();

  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  // Track the last toggled-on video ID for Shift+click range selection.
  // We store the ID (not the index) so the anchor stays correct even
  // when the videos array changes (SWR revalidation, filter toggle).
  const lastCheckedIdRef = useRef<string | null>(null);

  const inSelectionMode = checkedIds.size > 0;

  // Prune selection to IDs still visible in the current feed. Fires whenever
  // the `videos` prop changes — on channel switch, filter toggle, or bulk
  // action that removes items from the feed. This avoids two bugs:
  //   1. UX: BulkActionBar showing "N selected" for items the user can't
  //      see after navigating away.
  //   2. Safety: a stale id from a previously-viewed channel being sent to
  //      /api/videos/bulk, where the ownership check would accept it and
  //      silently mutate invisible videos.
  // We prune instead of clearing so background SWR revalidations (which
  // return a new array with the same ids) don't fight the user's in-
  // progress selection.
  useEffect(() => {
    const visibleIds = new Set(videos.map((v) => v.id));
    setCheckedIds((prev) => {
      const prevIds = Array.from(prev);
      const kept = prevIds.filter((id) => visibleIds.has(id));
      if (kept.length === prevIds.length) {
        return prev;
      }
      return new Set(kept);
    });
  }, [videos]);

  const toggleChecked = useCallback(
    (id: string, next: boolean, shiftKey?: boolean) => {
      const currentIndex = videos.findIndex((v) => v.id === id);

      if (shiftKey && next && lastCheckedIdRef.current != null) {
        // Resolve the anchor ID to its current index in the (possibly changed) list.
        const anchorIndex = videos.findIndex((v) => v.id === lastCheckedIdRef.current);
        if (anchorIndex !== -1) {
          const from = Math.min(anchorIndex, currentIndex);
          const to = Math.max(anchorIndex, currentIndex);
          setCheckedIds((prev) => {
            const copy = new Set(prev);
            for (let i = from; i <= to; i++) {
              copy.add(videos[i].id);
            }
            return copy;
          });
        } else {
          // Anchor video is no longer in the list — fall back to single toggle.
          setCheckedIds((prev) => {
            const copy = new Set(prev);
            copy.add(id);
            return copy;
          });
        }
      } else {
        setCheckedIds((prev) => {
          const copy = new Set(prev);
          if (next) {
            copy.add(id);
          } else {
            copy.delete(id);
          }
          return copy;
        });
      }

      if (next) {
        lastCheckedIdRef.current = id;
      }
    },
    [videos]
  );

  function clearSelection() {
    setCheckedIds(new Set());
    lastCheckedIdRef.current = null;
  }

  // Loading takes precedence over the empty state. Without this
  // guard the empty-state copy ("No starred videos yet…") would
  // flash for ~100ms on every filter change while SWR is fetching
  // the new key — incorrect, since we don't actually know whether
  // the bucket is empty until the response lands.
  if (isLoading) {
    return <VideoListSkeleton />;
  }

  if (videos.length === 0) {
    // No "Add channel" CTA here — VideoList only renders when the
    // user already has at least one channel. The first-time
    // no-channels-at-all path is handled in InboxShell's
    // showEmptyState branch with its own prominent button.
    return (
      <div className="flex flex-1 items-center justify-center p-8 text-center text-sm text-gray-500">
        {emptyMessage}
      </div>
    );
  }

  const selectedArray = Array.from(checkedIds);

  return (
    <div className="flex flex-col">
      <BulkActionBar selectedIds={selectedArray} onClear={clearSelection} />
      <ul className="divide-y divide-gray-100">
        {videos.map((video) => {
          const isSelected = selectedVideoId === video.id;
          const href =
            filterContext.length > 0
              ? `/videos/${encodeURIComponent(video.sourceId)}?returnTo=${encodeURIComponent(filterContext)}`
              : `/videos/${encodeURIComponent(video.sourceId)}`;

          return (
            <VideoRow
              key={video.id}
              video={video}
              isSelected={isSelected}
              isChecked={checkedIds.has(video.id)}
              onToggleChecked={toggleChecked}
              href={href}
              inSelectionMode={inSelectionMode}
              onOpenNotes={onOpenNotes}
            />
          );
        })}
      </ul>
    </div>
  );
}
