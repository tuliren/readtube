'use client';

import { Archive, Bookmark, BookmarkCheck, Clock, Star } from 'lucide-react';
import Link from 'next/link';

import { Checkbox } from '@/components/ui/checkbox';
import { formatDurationSeconds } from '@/lib/format/duration';
import type { VideoData } from '@/lib/types';

import { useTriage } from './useTriage';

interface Props {
  video: VideoData;
  isSelected: boolean;
  isChecked: boolean;
  onToggleChecked: (id: string, next: boolean) => void;
  href: string;
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

/**
 * One row in the inbox video list. The row hosts:
 * - a multi-select checkbox (shown on hover or when any row is checked)
 * - the unread dot + title + metadata (the clickable link)
 * - star / read-later / snooze (tomorrow) / archive action icons
 *
 * The action icons are wrapped in buttons that stop propagation so they
 * don't trigger the row's Link navigation.
 */
export default function VideoRow({ video, isSelected, isChecked, onToggleChecked, href }: Props) {
  const triage = useTriage();
  const isUnread = video.readAt == null;

  function stop(e: React.MouseEvent | React.KeyboardEvent) {
    e.preventDefault();
    e.stopPropagation();
  }

  function snoozeTomorrow() {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(9, 0, 0, 0);
    void triage.snoozeUntil(video.id, tomorrow);
  }

  return (
    <li className="group">
      <div
        className={`flex items-start gap-2 px-4 py-3 transition-colors ${
          isSelected ? 'bg-blue-50' : 'hover:bg-gray-50'
        }`}
      >
        <div className="pt-1" onClick={(e) => stop(e)} role="presentation">
          <Checkbox
            checked={isChecked}
            onCheckedChange={(next) => onToggleChecked(video.id, next === true)}
            aria-label={`Select ${video.title}`}
            className={isChecked ? '' : 'opacity-0 group-hover:opacity-100'}
          />
        </div>

        <Link href={href} className="flex min-w-0 flex-1 items-start gap-2">
          {isUnread ? (
            <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-blue-600" />
          ) : (
            <span className="mt-1.5 h-2 w-2 shrink-0" />
          )}

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
              {(() => {
                const duration = formatDurationSeconds(video.durationSeconds);
                return duration != null ? ` · ${duration}` : null;
              })()}
              {video.noteCount > 0
                ? ` · ${video.noteCount} note${video.noteCount === 1 ? '' : 's'}`
                : null}
            </p>
            {video.description != null && (
              <p className="mt-1 line-clamp-1 text-xs text-gray-400">{video.description}</p>
            )}
          </div>
        </Link>

        <div
          className="flex shrink-0 items-center gap-1 opacity-0 group-hover:opacity-100 data-[active=true]:opacity-100"
          data-active={video.isStarred || video.isSaved}
        >
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
              snoozeTomorrow();
            }}
            title="Snooze until tomorrow 9am"
            className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-purple-500"
          >
            <Clock className="h-4 w-4" />
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
        </div>
      </div>
    </li>
  );
}
