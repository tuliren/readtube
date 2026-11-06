'use client';

import type { SuggestedChannel } from '@/lib/onboarding/types';
import { cn } from '@/lib/utils';

import OnboardingChannelAvatar from './OnboardingChannelAvatar';
import PreviewButton from './PreviewButton';
import SelectionCheck from './SelectionCheck';

interface Props {
  channel: SuggestedChannel;
  selected: boolean;
  onToggle: (id: string) => void;
  onPreview: (id: string) => void;
}

/**
 * One channel on the onboarding page. Top row: avatar, name, follower
 * count, Preview, and the pick's check mark (the same as a video card's). Below, the newest titles
 * across the card's full width, for a peek at what it posts.
 *
 * Clicking anywhere toggles the pick: a transparent button covers the
 * card (`z-[1]`), and the check mark only mirrors its state. Preview is
 * the one control above it.
 */
export default function SuggestedChannelCard({ channel, selected, onToggle, onPreview }: Props) {
  return (
    <div
      className={cn(
        'group relative isolate flex flex-col gap-3 rounded-xl border p-4 transition-colors',
        selected
          ? 'border-blue-500 bg-blue-50/60 dark:border-blue-400 dark:bg-blue-500/10'
          : 'border-border bg-background hover:border-foreground/30'
      )}
    >
      <button
        type="button"
        aria-pressed={selected}
        aria-label={`Follow ${channel.name}`}
        onClick={() => onToggle(channel.id)}
        className="absolute inset-0 z-[1] cursor-pointer rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
      />
      <div className="flex items-center gap-3">
        <OnboardingChannelAvatar name={channel.name} logoUrl={channel.logoUrl} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-foreground" title={channel.name}>
            {channel.name}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {channel.followerCount === 1
              ? 'Followed by 1 reader'
              : `Followed by ${channel.followerCount} readers`}
          </p>
        </div>
        <PreviewButton
          label={channel.name}
          className="relative"
          onClick={() => onPreview(channel.id)}
        />
        <SelectionCheck selected={selected} variant="plain" />
      </div>
      {channel.recentVideoTitles.length > 0 && (
        <ul className="space-y-0.5">
          {channel.recentVideoTitles.map((title, index) => (
            <li key={index} className="truncate text-xs text-muted-foreground" title={title}>
              {title}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
