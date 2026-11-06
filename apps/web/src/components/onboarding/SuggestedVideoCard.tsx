'use client';

import { formatDurationSeconds } from '@/lib/format/duration';
import { relativeTime } from '@/lib/format/relativeTime';
import type { SuggestedVideo } from '@/lib/onboarding/types';
import { cn } from '@/lib/utils';

import PreviewButton from './PreviewButton';
import SelectionCheck from './SelectionCheck';
import { thumbnailSrc } from './thumbnailSrc';

interface Props {
  video: SuggestedVideo;
  selected: boolean;
  onToggle: (id: string) => void;
  onPreview: (id: string) => void;
  /** `Date.now()` captured after mount; null during SSR. */
  now: number | null;
}

/**
 * One video on the onboarding page: thumbnail, title, channel, and the
 * summary headline, so a new user sees what they'd be reading.
 *
 * Clicking anywhere toggles the pick, shown as a check over the
 * thumbnail: a transparent button covers the card (`z-[1]`). Preview,
 * on the thumbnail, is the one control above it.
 */
export default function SuggestedVideoCard({ video, selected, onToggle, onPreview, now }: Props) {
  const duration = formatDurationSeconds(video.durationSeconds);
  return (
    <div
      className={cn(
        'group relative isolate flex flex-col overflow-hidden rounded-xl border transition-colors',
        selected
          ? 'border-blue-500 ring-1 ring-blue-500 dark:border-blue-400 dark:ring-blue-400'
          : 'border-border hover:border-foreground/30'
      )}
    >
      <button
        type="button"
        aria-pressed={selected}
        aria-label={`Select ${video.title}`}
        onClick={() => onToggle(video.id)}
        className="absolute inset-0 z-[1] cursor-pointer rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500"
      />
      <div className="relative aspect-video w-full overflow-hidden bg-muted">
        {video.thumbnailUrl != null && (
          <img
            src={thumbnailSrc(video.thumbnailUrl)}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
            loading="lazy"
            referrerPolicy="no-referrer"
          />
        )}
        <PreviewButton
          label={video.title}
          variant="overlay"
          className="absolute bottom-1.5 left-1.5"
          onClick={() => onPreview(video.id)}
        />
        {duration != null && (
          <span className="absolute bottom-1.5 right-1.5 rounded bg-black/75 px-1.5 py-0.5 text-[11px] font-medium text-white">
            {duration}
          </span>
        )}
        <SelectionCheck selected={selected} variant="overlay" className="absolute right-2 top-2" />
      </div>
      <div className="flex flex-1 flex-col gap-1 p-3">
        <p className="line-clamp-2 text-sm font-semibold text-foreground">{video.title}</p>
        <p className="truncate text-xs text-muted-foreground">
          {video.channelName}
          {video.publishedAt != null ? ` · ${relativeTime(video.publishedAt, now)}` : null}
        </p>
        {video.headline != null && (
          <p className="line-clamp-2 text-xs text-muted-foreground">{video.headline}</p>
        )}
      </div>
    </div>
  );
}
