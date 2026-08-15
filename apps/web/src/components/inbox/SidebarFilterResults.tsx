'use client';

import { List, ListMusic } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { useMemo } from 'react';

import { useSidebarData } from '@/components/dashboard/SidebarDataContext';
import { displayChannelName } from '@/lib/inbox/channelName';
import { playlistDisplayName } from '@/lib/inbox/playlistName';
import { filterChannels, filterLabeled, filterPlaylists } from '@/lib/inbox/sidebarFilter';
import { INBOX_VIEWS, inboxViewHref } from '@/lib/inbox/views';
import type { ChannelData } from '@/lib/types';
import { channelHref } from '@/lib/urls/channelHref';

import ChannelAvatar from './ChannelAvatar';
import { SidebarBadge, SidebarRowContent, sidebarRowClass } from './SidebarRow';

interface Props {
  /** Trimmed, non-empty filter text from SidebarFilterInput. */
  query: string;
  channels: ChannelData[];
  selectedChannelId: string | null;
}

interface FixedEntry {
  key: string;
  label: string;
  href: string;
  icon: LucideIcon;
  unreadCount: number;
}

/**
 * Flat list of navbar items matching the sidebar filter text, replacing
 * the regular Views/Videos/Channels sections while the filter is
 * active. Rows keep the section grouping and the shared sidebar row
 * styling so a filtered row looks exactly like its unfiltered
 * counterpart — same label, badge, and destination.
 */
export default function SidebarFilterResults({ query, channels, selectedChannelId }: Props) {
  const { playlists, libraryCounts } = useSidebarData();

  const viewEntries = useMemo<FixedEntry[]>(
    () =>
      INBOX_VIEWS.map((view) => ({
        key: `view-${view.key}`,
        label: view.label,
        href: inboxViewHref(view),
        icon: view.icon,
        unreadCount: 0,
      })),
    []
  );
  const standaloneEntries = useMemo<FixedEntry[]>(
    () => [
      {
        key: 'standalone',
        label: 'Standalone',
        href: '/videos/standalone',
        icon: List,
        unreadCount: libraryCounts?.standaloneUnread ?? 0,
      },
    ],
    [libraryCounts]
  );

  const matchedViews = filterLabeled(viewEntries, query);
  const matchedStandalone = filterLabeled(standaloneEntries, query);
  const matchedPlaylists = filterPlaylists(playlists, query);
  const matchedChannels = filterChannels(channels, query);

  const totalMatches =
    matchedViews.length +
    matchedStandalone.length +
    matchedPlaylists.length +
    matchedChannels.length;
  if (totalMatches === 0) {
    return <p className="px-6 py-4 text-xs text-muted-foreground">No matching sidebar items.</p>;
  }

  return (
    <div className="flex flex-col">
      {matchedViews.length > 0 && (
        <FilterGroup heading="Views">
          {matchedViews.map((entry) => (
            <FixedEntryRow key={entry.key} entry={entry} />
          ))}
        </FilterGroup>
      )}
      {(matchedStandalone.length > 0 || matchedPlaylists.length > 0) && (
        <FilterGroup heading="Videos">
          {matchedStandalone.map((entry) => (
            <FixedEntryRow key={entry.key} entry={entry} />
          ))}
          {matchedPlaylists.map((playlist) => (
            <li key={playlist.id}>
              <Link href={`/videos/playlists/${playlist.id}`} className={sidebarRowClass(false)}>
                {playlist.thumbnailUrl != null ? (
                  <>
                    <img
                      src={playlist.thumbnailUrl}
                      alt=""
                      className="h-4 w-4 shrink-0 rounded-sm object-cover"
                    />
                    <span className="truncate">{playlistDisplayName(playlist)}</span>
                    <SidebarBadge count={playlist.unreadCount} />
                  </>
                ) : (
                  <SidebarRowContent
                    icon={ListMusic}
                    label={playlistDisplayName(playlist)}
                    trailing={<SidebarBadge count={playlist.unreadCount} />}
                  />
                )}
              </Link>
            </li>
          ))}
        </FilterGroup>
      )}
      {matchedChannels.length > 0 && (
        <FilterGroup heading="Channels">
          {matchedChannels.map((channel) => (
            <li key={channel.id}>
              <Link
                href={channelHref(channel)}
                className={sidebarRowClass(selectedChannelId === channel.id)}
              >
                {channel.logoUrl != null ? (
                  <ChannelAvatar url={channel.logoUrl} size={40} cssSize="h-4 w-4" />
                ) : (
                  <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-muted text-[9px] font-semibold text-muted-foreground">
                    {channel.name.charAt(0).toUpperCase()}
                  </span>
                )}
                <span className="truncate">{displayChannelName(channel.name)}</span>
                <SidebarBadge count={channel.unreadCount} />
              </Link>
            </li>
          ))}
        </FilterGroup>
      )}
    </div>
  );
}

function FilterGroup({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <div className="px-3 pt-4">
      <p className="mb-1 px-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {heading}
      </p>
      <ul className="space-y-0.5">{children}</ul>
    </div>
  );
}

function FixedEntryRow({ entry }: { entry: FixedEntry }) {
  return (
    <li>
      <Link href={entry.href} className={sidebarRowClass(false)}>
        <SidebarRowContent
          icon={entry.icon}
          label={entry.label}
          trailing={<SidebarBadge count={entry.unreadCount} />}
        />
      </Link>
    </li>
  );
}
