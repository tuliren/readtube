import { auth } from '@clerk/nextjs/server';
import { prisma } from '@readtube/database';
import { notFound, redirect } from 'next/navigation';

import InboxShell from '@/components/inbox/InboxShell';
import { ensureUserExists } from '@/lib/db/user';
import {
  loadInboxVideos,
  resolveChannelHandle,
  searchParamsToInboxQuery,
} from '@/lib/inbox/loadVideos';
import { isEmptyString } from '@/lib/string';
import { getSubscribedChannelsWithUnread } from '@/lib/subscriptions';
import type { ChannelData } from '@/lib/types';

interface Props {
  // Wide Next.js shape — we forward the whole bag through
  // searchParamsToInboxQuery / parseInboxQuery so SSR honors every
  // filter the client codec knows about (starred, saved, snoozed,
  // archived, unread, q, from, to, tagIds, sort, …), not just the
  // channelId. Without this, landing on /inbox?starred=1 SSR-rendered
  // every video and InboxShell used that as fallbackData for the
  // filtered key, briefly flashing the wrong list before SWR resolved.
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function InboxPage({ searchParams }: Props) {
  const { userId } = await auth();
  if (userId == null) {
    redirect('/');
  }

  await ensureUserExists(userId);

  const rawQuery = searchParamsToInboxQuery(await searchParams);
  const query = await resolveChannelHandle(prisma, userId, rawQuery);
  // Match the API behavior: an explicit `?channelHandle=…` that
  // doesn't resolve to a subscribed channel is a 404, not a silent
  // fallback to "all channels" (which would briefly flash the full
  // inbox before the client-side fetch corrects it).
  if (!isEmptyString(rawQuery.channelHandle) && isEmptyString(query.channelId)) {
    notFound();
  }
  const selectedChannelId = query.channelId ?? null;

  // Single SQL query: subscriptions + channel metadata + per-channel unread
  // counts (with watermark + consumption filter), all in one round-trip.
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

  // loadInboxVideos is the same helper /api/videos uses, so the SSR
  // payload is byte-for-byte identical to what SWR would have fetched
  // for this URL — the InboxShell fallback is now correct for any key
  // a user can land on directly (bookmark, shared link, sidebar nav).
  // Returns one page of videos plus the unpaginated total so the
  // header can render Page X of N controls.
  const initial = await loadInboxVideos(prisma, userId, query);

  return (
    <InboxShell
      initialChannels={channels}
      initialVideos={initial.videos}
      initialTotal={initial.total}
      selectedChannelId={selectedChannelId}
      selectedVideoId={null}
    />
  );
}
