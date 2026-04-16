'use client';

import { ListMusic, MoreHorizontal, Video } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';

import AddVideoModal from '@/components/inbox/AddVideoModal';
import NewPlaylistDialog from '@/components/inbox/NewPlaylistDialog';
import VideoLibraryMenuItems from '@/components/inbox/VideoLibraryMenuItems';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { formatDurationSeconds } from '@/lib/format/duration';
import type { VideoData } from '@/lib/types';

interface Props {
  videos: VideoData[];
  emptyMessage: string;
  /** Show "Add video" + "Add playlist" buttons in the empty state. */
  showAddActions?: boolean;
}

/**
 * Minimal list view for the Videos sidebar section (All / Standalone /
 * Playlist). Intentionally simpler than InboxListView's VideoList —
 * no bulk actions, no pagination, no filter chips. If the library
 * grows inbox-style affordances later, consider consolidating.
 */
export default function LibraryVideoList({ videos, emptyMessage, showAddActions }: Props) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  if (videos.length === 0) {
    if (showAddActions) {
      return <LibraryEmptyState message={emptyMessage} />;
    }
    return (
      <div className="flex flex-1 items-center justify-center px-4 py-24 text-sm text-gray-500">
        {emptyMessage}
      </div>
    );
  }

  // Build a returnTo so the reader's Back link comes back here,
  // matching the pattern used by VideoList.tsx.
  const qs = searchParams.toString();
  const returnTo = qs.length > 0 ? `${pathname}?${qs}` : (pathname ?? '/videos');

  return (
    <ul className="divide-y divide-gray-100">
      {videos.map((v) => (
        <LibraryVideoRow key={v.id} video={v} returnTo={returnTo} />
      ))}
    </ul>
  );
}

function LibraryVideoRow({ video, returnTo }: { video: VideoData; returnTo: string }) {
  const href = `/videos/${encodeURIComponent(video.sourceId)}?returnTo=${encodeURIComponent(returnTo)}`;
  return (
    <li className="group flex items-start gap-3 px-4 py-3 hover:bg-gray-50">
      <Link href={href} className="flex min-w-0 flex-1 items-start gap-3">
        {video.thumbnailUrl != null && (
          <img
            src={video.thumbnailUrl}
            alt=""
            className="h-20 w-32 shrink-0 rounded bg-gray-100 object-cover"
            loading="lazy"
          />
        )}
        <div className="min-w-0 flex-1">
          <div className="line-clamp-2 text-sm font-medium text-gray-900">{video.title}</div>
          <div className="mt-1 text-xs text-gray-500">
            <span className="truncate">{video.channelName}</span>
            {video.durationSeconds != null && (
              <>
                <span className="mx-1.5">·</span>
                <span>{formatDurationSeconds(video.durationSeconds)}</span>
              </>
            )}
            <span className="mx-1.5">·</span>
            <LibraryPublishedAt publishedAt={video.publishedAt} />
          </div>
        </div>
      </Link>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            onClick={(e) => e.stopPropagation()}
            title="More actions"
            aria-label="More actions"
            className="mt-1 shrink-0 rounded p-1 text-gray-400 opacity-0 hover:bg-gray-100 hover:text-gray-600 group-hover:opacity-100"
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <VideoLibraryMenuItems video={video} />
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  );
}

/**
 * Post-mount relative-time label. Matches the hydration-safe pattern
 * in VideoRow.tsx: SSR renders an absolute locale-locked date, then a
 * `useEffect` swaps to relative once we have a client-side `Date.now()`.
 */
function LibraryPublishedAt({ publishedAt }: { publishedAt: string }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
  }, []);

  const absolute = new Date(publishedAt).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
  if (now == null) {
    return <span>{absolute}</span>;
  }
  const diffMs = now - new Date(publishedAt).getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays < 1) {
    return <span>today</span>;
  }
  if (diffDays < 30) {
    return <span>{diffDays}d ago</span>;
  }
  return <span>{absolute}</span>;
}

function LibraryEmptyState({ message }: { message: string }) {
  const [addVideoOpen, setAddVideoOpen] = useState(false);
  const [addPlaylistOpen, setAddPlaylistOpen] = useState(false);

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
      <div>
        <p className="text-lg font-semibold text-gray-700">No videos yet</p>
        <p className="mt-1 text-sm text-gray-500">{message}</p>
      </div>
      <div className="flex gap-3">
        <button
          onClick={() => setAddVideoOpen(true)}
          className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          <Video className="h-4 w-4" />
          Add video
        </button>
        <button
          onClick={() => setAddPlaylistOpen(true)}
          className="inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          <ListMusic className="h-4 w-4" />
          Add playlist
        </button>
      </div>
      <AddVideoModal open={addVideoOpen} onOpenChange={setAddVideoOpen} />
      <NewPlaylistDialog
        open={addPlaylistOpen}
        onOpenChange={setAddPlaylistOpen}
        onCreated={() => {}}
      />
    </div>
  );
}
