'use client';

import { ChevronRight } from 'lucide-react';
import { useState } from 'react';

import { formatDurationSeconds } from '@/lib/format/duration';
import { relativeTime } from '@/lib/format/relativeTime';
import type { ChannelPreview, ChannelPreviewVideo } from '@/lib/onboarding/types';
import { buildChannelLink } from '@/lib/urls/watchUrl';

import OnboardingChannelAvatar from './OnboardingChannelAvatar';
import { thumbnailSrc } from './thumbnailSrc';

interface Props {
  channel: ChannelPreview;
  onOpenVideo: (id: string) => void;
  /** `Date.now()` captured after mount; null during SSR. */
  now: number | null;
}

/**
 * The channel half of the onboarding preview: who the channel is and
 * what it posted lately. Readable videos open their own preview; the
 * rest are listed anyway, since how often a channel posts is part of
 * what a user is deciding on.
 */
export default function ChannelPreviewPanel({ channel, onOpenVideo, now }: Props) {
  const [descriptionExpanded, setDescriptionExpanded] = useState(false);
  const { url: channelUrl, platformName } = buildChannelLink(channel.platform, channel.sourceId);
  const description = channel.description?.trim() ?? '';

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-6">
      <div className="flex items-center gap-4">
        <OnboardingChannelAvatar name={channel.name} logoUrl={channel.logoUrl} size="lg" />
        <div className="min-w-0">
          <h2 className="text-xl font-bold text-foreground">{channel.name}</h2>
          <p className="text-sm text-muted-foreground">
            {channel.handle != null ? `${channel.handle} · ` : null}
            {channel.followerCount === 1
              ? 'Followed by 1 reader'
              : `Followed by ${channel.followerCount} readers`}
            {' · '}
            <a
              href={channelUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-500 hover:underline"
            >
              View on {platformName} ↗
            </a>
          </p>
        </div>
      </div>

      {description.length > 0 && (
        <div>
          <p
            className={`whitespace-pre-line text-sm text-muted-foreground ${
              descriptionExpanded ? '' : 'line-clamp-3'
            }`}
          >
            {description}
          </p>
          {isLongDescription(description) && (
            <button
              type="button"
              onClick={() => setDescriptionExpanded((v) => !v)}
              className="mt-1 text-xs font-medium text-blue-500 hover:underline"
            >
              {descriptionExpanded ? 'Show less' : 'Show more'}
            </button>
          )}
        </div>
      )}

      <section aria-labelledby="channel-preview-videos" className="flex flex-col gap-2">
        <h3 id="channel-preview-videos" className="text-sm font-semibold text-foreground">
          Recent videos
        </h3>
        {channel.videos.length === 0 ? (
          <p className="text-sm text-muted-foreground">No videos yet.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {channel.videos.map((video) => (
              <li key={video.id}>
                <PreviewVideoRow video={video} now={now} onOpen={() => onOpenVideo(video.id)} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/** Rough check for whether the description overflows its 3-line clamp. */
function isLongDescription(text: string): boolean {
  return text.length > 200 || text.split('\n').length > 3;
}

function PreviewVideoRow({
  video,
  now,
  onOpen,
}: {
  video: ChannelPreviewVideo;
  now: number | null;
  onOpen: () => void;
}) {
  const duration = formatDurationSeconds(video.durationSeconds);
  const meta = [
    video.publishedAt != null ? relativeTime(video.publishedAt, now) : null,
    duration,
    video.readable ? null : 'Not summarized yet',
  ].filter((part): part is string => part != null);

  const content = (
    <>
      <span className="relative block aspect-video w-32 shrink-0 overflow-hidden rounded-md bg-muted">
        {video.thumbnailUrl != null && (
          <img
            src={thumbnailSrc(video.thumbnailUrl)}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
            loading="lazy"
            referrerPolicy="no-referrer"
          />
        )}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="line-clamp-2 text-sm font-medium text-foreground">{video.title}</span>
        <span className="truncate text-xs text-muted-foreground">{meta.join(' · ')}</span>
        {video.headline != null && (
          <span className="line-clamp-1 text-xs text-muted-foreground">{video.headline}</span>
        )}
      </span>
    </>
  );

  if (!video.readable) {
    return <div className="flex items-center gap-3 rounded-lg p-2 opacity-60">{content}</div>;
  }
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-center gap-3 rounded-lg p-2 text-left hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
    >
      {content}
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
    </button>
  );
}
