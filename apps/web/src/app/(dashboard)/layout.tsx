import { auth } from '@clerk/nextjs/server';
import { prisma } from '@readtube/database';
import { ReactNode } from 'react';

import DashboardShell from '@/components/dashboard/DashboardShell';
import { ensureUserExists } from '@/lib/db/user';
import { getSubscribedChannelsWithUnread } from '@/lib/subscriptions';
import type { ChannelData } from '@/lib/types';

/**
 * Shared sidebar + providers for /inbox, /inbox/ask, /channels/[slug],
 * and /videos/[videoId]. Loads the channels payload once per request
 * and hands it to the client `DashboardShell`, which owns the sidebar,
 * the add-channel modal, and the per-section collapse state.
 *
 * Auth gating is deliberately left to the individual pages so each
 * route can pick the right destination: /inbox, /channels/[slug], and
 * /inbox/ask redirect anonymous callers to `/`, while /videos/[videoId]
 * redirects to the public mirror at /p/videos/[sourceId] so shared
 * canonical links still work for logged-out recipients. Hard-redirecting
 * here would shadow the video page's mirror redirect.
 *
 * When no user is signed in we skip the channels fetch and the shell
 * entirely — each page's own `redirect()` runs immediately in its
 * server render, so the logged-out branch never actually paints.
 */
export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const { userId } = await auth();

  if (userId == null) {
    return <div className="h-screen overflow-hidden">{children}</div>;
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
