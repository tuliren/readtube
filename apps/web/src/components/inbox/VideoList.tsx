'use client';

import { useSearchParams } from 'next/navigation';
import { useState } from 'react';

import type { VideoData } from '@/lib/types';

import BulkActionBar from './BulkActionBar';
import VideoRow from './VideoRow';

interface Props {
  videos: VideoData[];
  selectedVideoId: string | null;
}

export default function VideoList({ videos, selectedVideoId }: Props) {
  const searchParams = useSearchParams();
  const channelParam = searchParams.get('channel');

  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());

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
      <div className="flex flex-1 items-center justify-center p-8 text-center text-sm text-gray-400">
        No videos yet. New videos will appear here after the next refresh.
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
            channelParam != null
              ? `/inbox/${video.id}?channel=${channelParam}`
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
