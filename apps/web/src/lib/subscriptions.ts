import type { PrismaClient } from '@readtube/database';

import {
  NEW_SUBSCRIPTION_MODE,
  type NewSubscriptionMode,
  RECENT_NEW_VIDEO_COUNT,
} from '@/lib/subscriptionConfig';

/**
 * Compute the initial value for `UserSubscription.read_at` for a brand-new
 * subscription, given a mode. Defaults to the project-wide
 * `NEW_SUBSCRIPTION_MODE` constant; tests can override.
 *
 * - `all_new`     → returns null. All existing videos appear unread.
 * - `none_new`    → returns now. All existing videos appear read.
 * - `recent_n_new` → returns the published_at of the (recentCount + 1)th
 *                    most recent video, leaving exactly `recentCount` videos
 *                    unread. If the channel has fewer than (N+1) videos,
 *                    returns null (everything appears unread).
 */
export async function computeInitialReadAt(
  prisma: PrismaClient,
  channelId: string,
  mode: NewSubscriptionMode = NEW_SUBSCRIPTION_MODE,
  recentCount: number = RECENT_NEW_VIDEO_COUNT
): Promise<Date | null> {
  if (mode === 'all_new') {
    return null;
  }
  if (mode === 'none_new') {
    return new Date();
  }
  // recent_n_new
  const cutoff = await prisma.video.findMany({
    where: { channel_id: channelId },
    select: { published_at: true },
    orderBy: { published_at: 'desc' },
    skip: recentCount,
    take: 1,
  });
  return cutoff[0]?.published_at ?? null;
}

/**
 * Count unread videos for a (user, channel) pair given the user's watermark.
 * A video is unread iff there's no UserVideoConsumption row for this user
 * AND it was published after the watermark (or there's no watermark).
 */
export async function countUnreadVideos(
  prisma: PrismaClient,
  userId: string,
  channelId: string,
  readAt: Date | null
): Promise<number> {
  return prisma.video.count({
    where: {
      channel_id: channelId,
      consumptions: { none: { user_id: userId } },
      ...(readAt != null ? { published_at: { gt: readAt } } : {}),
    },
  });
}

/**
 * The shape returned by `getSubscribedChannelsWithUnread`. One row per
 * subscription, denormalized to include channel metadata, the user's
 * watermark, and the unread count — all computed in a single SQL query.
 */
export interface SubscribedChannelWithUnread {
  channel_id: string;
  read_at: Date | null;
  folder_id: string | null;
  priority: number;
  mute_until: Date | null;
  source_id: string;
  name: string;
  rss_url: string;
  created_at: Date;
  unread_count: number;
}

/**
 * Single-query alternative to fetching subscriptions and then issuing one
 * `prisma.video.count()` per channel. Joins UserSubscription, Channel, and
 * Video in one statement, returning per-channel unread counts that respect
 * both the per-subscription `read_at` watermark and individual
 * UserVideoConsumption rows.
 *
 * Returns rows sorted by channel name (case-insensitive).
 */
export async function getSubscribedChannelsWithUnread(
  prisma: PrismaClient,
  userId: string
): Promise<SubscribedChannelWithUnread[]> {
  // COUNT(*) returns BIGINT in Postgres, which Prisma surfaces as `bigint`.
  // We convert to `number` below — channel video counts will never overflow.
  const rows = await prisma.$queryRaw<
    Array<{
      channel_id: string;
      read_at: Date | null;
      folder_id: string | null;
      priority: number;
      mute_until: Date | null;
      source_id: string;
      name: string;
      rss_url: string;
      created_at: Date;
      unread_count: bigint;
    }>
  >`
    SELECT
      us."channel_id"  AS channel_id,
      us."read_at"     AS read_at,
      us."folder_id"   AS folder_id,
      us."priority"    AS priority,
      us."mute_until"  AS mute_until,
      c."source_id"    AS source_id,
      c."name"         AS name,
      c."rss_url"      AS rss_url,
      c."created_at"   AS created_at,
      COUNT(v."id")    AS unread_count
    FROM "UserSubscription" us
    JOIN "Channel" c ON c."id" = us."channel_id"
    LEFT JOIN "Video" v ON v."channel_id" = us."channel_id"
      AND (us."read_at" IS NULL OR v."published_at" > us."read_at")
      AND NOT EXISTS (
        SELECT 1
        FROM "UserVideoConsumption" k
        WHERE k."video_id" = v."id" AND k."user_id" = us."user_id"
      )
    WHERE us."user_id" = ${userId}
    GROUP BY
      us."channel_id", us."read_at", us."folder_id", us."priority", us."mute_until",
      c."source_id", c."name", c."rss_url", c."created_at"
    ORDER BY LOWER(c."name") ASC
  `;

  return rows.map((row) => ({
    channel_id: row.channel_id,
    read_at: row.read_at,
    folder_id: row.folder_id,
    priority: row.priority,
    mute_until: row.mute_until,
    source_id: row.source_id,
    name: row.name,
    rss_url: row.rss_url,
    created_at: row.created_at,
    unread_count: Number(row.unread_count),
  }));
}

/**
 * Bulk-mark videos as read for a user by bumping the per-subscription
 * watermark(s). When `channelId` is provided, only that channel's
 * subscription is updated; otherwise every subscription for the user is
 * updated in a single statement.
 *
 * Returns `null` if `channelId` is provided but the user is not subscribed
 * to that channel (caller should respond 404). Otherwise returns the number
 * of subscriptions touched.
 */
export async function markAllReadForUser(
  prisma: PrismaClient,
  userId: string,
  channelId?: string
): Promise<{ channels: number } | null> {
  const now = new Date();

  if (channelId != null) {
    const sub = await prisma.userSubscription.findFirst({
      where: { user_id: userId, channel_id: channelId },
      select: { id: true },
    });
    if (sub == null) {
      return null;
    }
    await prisma.userSubscription.update({
      where: { id: sub.id },
      data: { read_at: now },
    });
    return { channels: 1 };
  }

  const result = await prisma.userSubscription.updateMany({
    where: { user_id: userId },
    data: { read_at: now },
  });
  return { channels: result.count };
}
