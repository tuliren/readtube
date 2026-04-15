import { auth } from '@clerk/nextjs/server';
import { prisma } from '@readtube/database';
import { redirect } from 'next/navigation';
import { ReactNode } from 'react';

import DashboardShell from '@/components/dashboard/DashboardShell';
import { ensureUserExists } from '@/lib/db/user';
import { getSubscribedChannelsWithUnread } from '@/lib/subscriptions';
import type { ChannelData } from '@/lib/types';

/**
 * Single authenticated shell for every post-signin page: /inbox,
 * /inbox/ask, /channels/[slug], /videos/[videoId]. Owns the auth
 * redirect (so individual pages don't each redirect) and the
 * `/api/channels` SSR payload consumed by the sidebar. The sidebar
 * itself lives inside the client-side `DashboardShell`, which also
 * owns the add-channel modal and the per-section collapse state.
 */
export default async function DashboardLayout({ children }: { children: ReactNode }) {
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
    <div className="h-screen overflow-hidden">
      <DashboardShell initialChannels={channels}>{children}</DashboardShell>
    </div>
  );
}
