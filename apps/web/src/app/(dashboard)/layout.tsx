import { auth } from '@clerk/nextjs/server';
import { prisma } from '@readtube/database';
import { redirect } from 'next/navigation';
import { ReactNode } from 'react';

import DashboardShell from '@/components/dashboard/DashboardShell';
import { ensureUserExists } from '@/lib/db/user';
import { getSubscribedChannelsWithUnread } from '@/lib/subscriptions';
import type { ChannelData, FolderData } from '@/lib/types';

/**
 * Shared sidebar + providers for every authenticated page:
 * `/inbox`, `/inbox/ask`, `/channels/[slug]`, and `/videos/[videoId]`.
 * Loads the channels payload once per request and hands it to the
 * client `DashboardShell`, which owns the sidebar, the add-channel
 * modal, and the per-section collapse state.
 *
 * Auth is enforced centrally by `proxy.ts` — every non-public route
 * goes through `auth.protect()` before this layout runs, so `userId`
 * is always non-null at runtime. The null check below is purely a
 * TypeScript narrow for the DB calls that follow.
 */
export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const { userId } = await auth();
  if (userId == null) {
    redirect('/');
  }

  await ensureUserExists(userId);

  const [subscriptionRows, folderRows] = await Promise.all([
    getSubscribedChannelsWithUnread(prisma, userId),
    prisma.folder.findMany({
      where: { user_id: userId },
      orderBy: [{ sort_order: 'asc' }, { name: 'asc' }],
      select: { id: true, name: true, sort_order: true },
    }),
  ]);
  const channels: ChannelData[] = subscriptionRows.map((row) => ({
    id: row.channel_id,
    sourceId: row.source_id,
    platform: row.source_type,
    name: row.name,
    handle: row.handle,
    rssUrl: row.rss_url,
    logoUrl: row.logo_url ?? null,
    createdAt: row.created_at.toISOString(),
    checkedAt: row.checked_at != null ? row.checked_at.toISOString() : null,
    unreadCount: row.unread_count,
    folderId: row.folder_id,
    priority: row.priority,
    muteUntil: row.mute_until != null ? row.mute_until.toISOString() : null,
  }));
  const folders: FolderData[] = folderRows.map((row) => ({
    id: row.id,
    name: row.name,
    sortOrder: row.sort_order,
  }));

  return (
    <div className="h-screen overflow-hidden">
      <DashboardShell initialChannels={channels} initialFolders={folders}>
        {children}
      </DashboardShell>
    </div>
  );
}
