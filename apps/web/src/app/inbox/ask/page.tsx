import { auth } from '@clerk/nextjs/server';
import { prisma } from '@readtube/database';
import { redirect } from 'next/navigation';

import InboxShell from '@/components/inbox/InboxShell';
import AskInboxChat from '@/components/reader/AskInboxChat';
import { ensureUserExists } from '@/lib/db/user';
import { getSubscribedChannelsWithUnread } from '@/lib/subscriptions';
import type { ChannelData } from '@/lib/types';

export default async function AskInboxPage() {
  const { userId } = await auth();
  if (userId == null) {
    redirect('/');
  }
  await ensureUserExists(userId);

  const rows = await getSubscribedChannelsWithUnread(prisma, userId);
  const channels: ChannelData[] = rows.map((row) => ({
    id: row.channel_id,
    sourceId: row.source_id,
    name: row.name,
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
      <AskInboxChat />
    </InboxShell>
  );
}
