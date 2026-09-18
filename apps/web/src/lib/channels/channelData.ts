import type { SubscribedChannelWithUnread } from '@/lib/subscriptions';
import type { ChannelData } from '@/lib/types';

/**
 * Single mapper from the `getSubscribedChannelsWithUnread` row shape to
 * the `ChannelData` payload the sidebar consumes. Both entry points that
 * build the sidebar list go through here — the `/api/channels` GET and
 * the SSR dashboard layout — so a new field only has to be wired once.
 */
export function toChannelData(row: SubscribedChannelWithUnread): ChannelData {
  return {
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
    consumption: {
      total: row.consumption_total,
      consumed: row.consumption_consumed,
      sinceSubscribed: row.consumption_since_subscribed,
    },
  };
}
