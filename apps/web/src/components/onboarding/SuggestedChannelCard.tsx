'use client';

import { Check, Plus } from 'lucide-react';

import ChannelAvatar from '@/components/inbox/ChannelAvatar';
import type { SuggestedChannel } from '@/lib/onboarding/types';
import { cn } from '@/lib/utils';

interface Props {
  channel: SuggestedChannel;
  selected: boolean;
  onToggle: (id: string) => void;
}

/**
 * One channel on the onboarding page: avatar, name, follower count,
 * and its newest titles so a new user can judge it at a glance. The
 * whole card toggles the pick; the pill on the right mirrors it as
 * Follow / Following.
 */
export default function SuggestedChannelCard({ channel, selected, onToggle }: Props) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={() => onToggle(channel.id)}
      className={cn(
        'flex w-full items-start gap-3 rounded-xl border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
        selected
          ? 'border-blue-500 bg-blue-50/60 dark:border-blue-400 dark:bg-blue-500/10'
          : 'border-border bg-background hover:border-foreground/30'
      )}
    >
      <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted text-lg font-semibold text-muted-foreground">
        {channel.logoUrl != null ? (
          <ChannelAvatar url={channel.logoUrl} size={96} cssSize="h-12 w-12" />
        ) : (
          channel.name.charAt(0).toUpperCase()
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold text-foreground">{channel.name}</span>
        <span className="block truncate text-xs text-muted-foreground">
          {channel.followerCount === 1
            ? 'Followed by 1 reader'
            : `Followed by ${channel.followerCount} readers`}
        </span>
        {channel.recentVideoTitles.length > 0 && (
          <span className="mt-2 block space-y-0.5">
            {channel.recentVideoTitles.map((title, index) => (
              <span key={index} className="block truncate text-xs text-muted-foreground">
                {title}
              </span>
            ))}
          </span>
        )}
      </span>
      <span
        aria-hidden
        className={cn(
          'inline-flex shrink-0 items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold',
          selected ? 'bg-blue-600 text-white' : 'bg-muted text-foreground'
        )}
      >
        {selected ? <Check className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
        {selected ? 'Following' : 'Follow'}
      </span>
    </button>
  );
}
