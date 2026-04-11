'use client';

import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';

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
}

export default function VideoList({ videos, selectedVideoId, emptyMessage }: Props) {
  const searchParams = useSearchParams();

  // Build the "filter context" we want to forward into the reader as
  // a single ?from=<encoded-query> param so the reader's Back button
  // can land back in the exact filtered list.
  //
  // Two cases:
  //   1. We're on `/inbox?starred=1` (or similar) — searchParams IS
  //      the filter context, so use its toString().
  //   2. We're already in the reader at `/inbox/<id>?from=<inner>` —
  //      forward the same `from` value verbatim so navigating between
  //      sibling videos doesn't lose the back-target.
  const filterContext = (() => {
    const fromInUrl = searchParams.get('from');
    if (fromInUrl != null) {
      return fromInUrl;
    }
    return searchParams.toString();
  })();

  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());

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

  function toggleChecked(id: string, next: boolean) {
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

  function clearSelection() {
    setCheckedIds(new Set());
  }

  if (videos.length === 0) {
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
              ? `/inbox/${video.id}?from=${encodeURIComponent(filterContext)}`
              : `/inbox/${video.id}`;

          return (
            <VideoRow
              key={video.id}
              video={video}
              isSelected={isSelected}
              isChecked={checkedIds.has(video.id)}
              onToggleChecked={toggleChecked}
              href={href}
            />
          );
        })}
      </ul>
    </div>
  );
}
