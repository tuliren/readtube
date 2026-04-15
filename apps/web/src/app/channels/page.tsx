import { auth } from '@clerk/nextjs/server';
import { prisma } from '@readtube/database';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import ChannelAvatar from '@/components/inbox/ChannelAvatar';
import InboxShell from '@/components/inbox/InboxShell';
import { ensureUserExists } from '@/lib/db/user';
import { displayChannelName } from '@/lib/inbox/channelName';
import { getSubscribedChannelsWithUnread } from '@/lib/subscriptions';
import type { ChannelData } from '@/lib/types';
import { channelHref } from '@/lib/urls/channelHref';

export default async function ChannelsListPage() {
  const { userId } = await auth();
  if (userId == null) {
    redirect('/');
  }

  await ensureUserExists(userId);

  const subscriptionRows = await getSubscribedChannelsWithUnread(prisma, userId);
  const channels: ChannelData[] = subscriptionRows.map((row) => ({
    id: row.channel_id,
    sourceId: row.source_id,
    name: row.name,
    handle: row.handle,
    rssUrl: row.rss_url,
    logoUrl: row.logo_url ?? null,
    createdAt: row.created_at.toISOString(),
    unreadCount: row.unread_count,
    folderId: row.folder_id,
    priority: row.priority,
    muteUntil: row.mute_until != null ? row.mute_until.toISOString() : null,
  }));

  return (
    <InboxShell
      initialChannels={channels}
      initialVideos={[]}
      initialTotal={0}
      selectedChannelId={null}
      selectedVideoId={null}
    >
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-4xl p-6">
          <h1 className="text-2xl font-bold text-gray-900">Channels</h1>
          <p className="mt-1 text-sm text-gray-600">
            {channels.length} subscribed {channels.length === 1 ? 'channel' : 'channels'}
          </p>
          {channels.length === 0 ? (
            <p className="mt-8 text-sm text-gray-500">
              You aren&rsquo;t subscribed to any channels yet.
            </p>
          ) : (
            <ul className="mt-6 grid gap-3 sm:grid-cols-2">
              {channels.map((channel) => (
                <li key={channel.id}>
                  <Link
                    href={channelHref(channel)}
                    className="flex items-center gap-3 rounded-lg border border-gray-200 p-3 hover:border-blue-300 hover:bg-blue-50"
                  >
                    {channel.logoUrl != null ? (
                      <ChannelAvatar url={channel.logoUrl} size={80} cssSize="h-10 w-10" />
                    ) : (
                      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-200 text-sm font-semibold text-gray-600">
                        {channel.name.charAt(0).toUpperCase()}
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-gray-900">
                        {displayChannelName(channel.name)}
                      </p>
                      {channel.handle != null && (
                        <p className="truncate text-xs text-gray-500">{channel.handle}</p>
                      )}
                    </div>
                    {channel.unreadCount > 0 && (
                      <span className="ml-auto shrink-0 rounded-full bg-blue-600 px-2 py-0.5 text-xs font-medium text-white">
                        {channel.unreadCount}
                      </span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </InboxShell>
  );
}
