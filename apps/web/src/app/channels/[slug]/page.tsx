import { auth } from '@clerk/nextjs/server';
import { prisma } from '@readtube/database';
import { notFound, redirect } from 'next/navigation';

import InboxShell from '@/components/inbox/InboxShell';
import { resolveChannelSlug } from '@/lib/channels/resolveChannelSlug';
import { ensureUserExists } from '@/lib/db/user';
import { loadInboxVideos, searchParamsToInboxQuery } from '@/lib/inbox/loadVideos';
import { getSubscribedChannelsWithUnread } from '@/lib/subscriptions';
import type { ChannelData } from '@/lib/types';

interface Props {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function ChannelPage({ params, searchParams }: Props) {
  const { userId } = await auth();
  if (userId == null) {
    redirect('/');
  }

  await ensureUserExists(userId);

  const { slug } = await params;
  const channel = await resolveChannelSlug(prisma, slug);
  if (channel == null) {
    notFound();
  }

  // IDOR: only show the channel if the user is subscribed to it.
  const subscribed = await prisma.userSubscription.findFirst({
    where: { user_id: userId, channel_id: channel.id },
    select: { id: true },
  });
  if (subscribed == null) {
    notFound();
  }

  // Scope the inbox loader to this channel. channelId is injected
  // server-side — it's not in the user-visible URL (the canonical
  // form is /channels/[slug]).
  const baseQuery = searchParamsToInboxQuery(await searchParams);
  const query = { ...baseQuery, channelId: channel.id };

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

  const initial = await loadInboxVideos(prisma, userId, query);

  return (
    <InboxShell
      initialChannels={channels}
      initialVideos={initial.videos}
      initialTotal={initial.total}
      selectedChannelId={channel.id}
      selectedVideoId={null}
    />
  );
}
