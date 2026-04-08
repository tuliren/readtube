'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

import type { VideoData } from '@/lib/types';

interface Props {
  videos: VideoData[];
  selectedVideoId: string | null;
}

function relativeTime(dateStr: string): string {
  const now = Date.now();
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
  return new Date(dateStr).toLocaleDateString();
}

export default function VideoList({ videos, selectedVideoId }: Props) {
  const searchParams = useSearchParams();
  const channelParam = searchParams.get('channel');

  if (videos.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center p-8 text-center text-sm text-gray-400">
        No videos yet. New videos will appear here after the next refresh.
      </div>
    );
  }

  return (
    <ul className="divide-y divide-gray-100">
      {videos.map((video) => {
        const isUnread = video.readAt === null;
        const isSelected = selectedVideoId === video.id;
        const href = channelParam
          ? `/inbox/${video.id}?channel=${channelParam}`
          : `/inbox/${video.id}`;

        return (
          <li key={video.id}>
            <Link
              href={href}
              className={`block px-4 py-3 transition-colors ${
                isSelected ? 'bg-blue-50' : 'hover:bg-gray-50'
              }`}
            >
              <div className="flex items-start gap-2">
                {isUnread && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-blue-600" />}
                {!isUnread && <span className="mt-1.5 h-2 w-2 shrink-0" />}

                <div className="min-w-0 flex-1">
                  <p
                    className={`truncate text-sm leading-snug ${
                      isUnread ? 'font-semibold text-gray-900' : 'font-normal text-gray-600'
                    }`}
                  >
                    {video.title}
                  </p>
                  <p className="mt-0.5 text-xs text-gray-400">
                    {video.channelName} · {relativeTime(video.publishedAt)}
                  </p>
                  {video.description && (
                    <p className="mt-1 line-clamp-1 text-xs text-gray-400">{video.description}</p>
                  )}
                </div>
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
