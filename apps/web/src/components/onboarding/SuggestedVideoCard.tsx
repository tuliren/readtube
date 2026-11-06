'use client';

import { Check } from 'lucide-react';

import { formatDurationSeconds } from '@/lib/format/duration';
import { relativeTime } from '@/lib/format/relativeTime';
import type { SuggestedVideo } from '@/lib/onboarding/types';
import { cn } from '@/lib/utils';

interface Props {
  video: SuggestedVideo;
  selected: boolean;
  onToggle: (id: string) => void;
  /** `Date.now()` captured after mount; null during SSR. */
  now: number | null;
}

/**
 * One video on the onboarding page: thumbnail, title, channel, and the
 * summary headline, so a new user sees what they'd be reading. The
 * whole card toggles the pick, shown as a check over the thumbnail.
 */
export default function SuggestedVideoCard({ video, selected, onToggle, now }: Props) {
  const duration = formatDurationSeconds(video.durationSeconds);
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={() => onToggle(video.id)}
      className={cn(
        'group flex w-full flex-col overflow-hidden rounded-xl border text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
        selected
          ? 'border-blue-500 ring-1 ring-blue-500 dark:border-blue-400 dark:ring-blue-400'
          : 'border-border hover:border-foreground/30'
      )}
    >
      <span className="relative block aspect-video w-full overflow-hidden bg-muted">
        {video.thumbnailUrl != null && (
          <img
            // Bilibili's CDN 403s with our Referer and serves http:// URLs.
            src={video.thumbnailUrl.replace(/^http:\/\//, 'https://')}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
            loading="lazy"
            referrerPolicy="no-referrer"
          />
        )}
        {duration != null && (
          <span className="absolute bottom-1.5 right-1.5 rounded bg-black/75 px-1.5 py-0.5 text-[11px] font-medium text-white">
            {duration}
          </span>
        )}
        <span
          aria-hidden
          className={cn(
            'absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full border-2 transition-colors',
            selected
              ? 'border-blue-600 bg-blue-600 text-white'
              : 'border-white bg-black/30 text-transparent group-hover:bg-black/50'
          )}
        >
          <Check className="h-3.5 w-3.5" />
        </span>
      </span>
      <span className="flex flex-1 flex-col gap-1 p-3">
        <span className="line-clamp-2 text-sm font-semibold text-foreground">{video.title}</span>
        <span className="truncate text-xs text-muted-foreground">
          {video.channelName}
          {video.publishedAt != null ? ` · ${relativeTime(video.publishedAt, now)}` : null}
        </span>
        {video.headline != null && (
          <span className="line-clamp-2 text-xs text-muted-foreground">{video.headline}</span>
        )}
      </span>
    </button>
  );
}
