import { prisma } from '@readtube/database';
import { ReactNode } from 'react';

import DashboardShell from '@/components/dashboard/DashboardShell';
import { toChannelData } from '@/lib/channels/channelData';
import { requireDashboardUserId } from '@/lib/dashboardUser';
import { getSubscribedChannelsWithUnread } from '@/lib/subscriptions';
import type { ChannelData, FolderData } from '@/lib/types';

/**
 * Shared sidebar + providers for every authenticated page:
 * `/inbox`, `/inbox/ask`, `/channels/[slug]`, and `/videos/[videoId]`.
 * Loads the channels payload once per request and hands it to the
 * client `DashboardShell`, which owns the sidebar, the add-channel
 * modal, and the per-section collapse state.
 *
 * Auth is enforced centrally by `proxy.ts`: every route under this
 * group is a protected prefix and goes through `auth.protect()` before
 * this layout runs. `requireDashboardUserId` is a second guard, and
 * makes sure the user's row is in place before any user data is read.
 * Pages render in parallel with this layout, so each page calls it too
 * (deduped per request) instead of relying on the layout having run.
 */
export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const userId = await requireDashboardUserId();

  const [subscriptionRows, folderRows] = await Promise.all([
    getSubscribedChannelsWithUnread(prisma, userId),
    prisma.folder.findMany({
      where: { user_id: userId },
      orderBy: [{ sort_order: 'asc' }, { name: 'asc' }],
      select: { id: true, name: true, sort_order: true },
    }),
  ]);
  const channels: ChannelData[] = subscriptionRows.map(toChannelData);
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
