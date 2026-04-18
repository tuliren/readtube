import type { Prisma, PrismaClient } from '@readtube/database';

import {
  NEW_SUBSCRIPTION_MODE,
  type NewSubscriptionMode,
  RECENT_NEW_VIDEO_COUNT,
} from '@/lib/subscriptionConfig';

/**
 * Prisma `where` clause matching videos whose effective publish date is
 * strictly greater than `watermark`. A video's effective date is its
 * `published_at` when present, otherwise `created_at` — so null-date
 * videos (scrape failed to find a date) still have a sensible
 * comparable timestamp and can be correctly classified as read or
 * unread relative to a user's or playlist's watermark.
 */
export function videoNewerThanWatermark(watermark: Date): Prisma.VideoWhereInput {
  return {
    OR: [
      { published_at: { gt: watermark } },
      { AND: [{ published_at: null }, { created_at: { gt: watermark } }] },
    ],
  };
}

/**
 * Inverse of `videoNewerThanWatermark` — matches videos whose effective
 * publish date is less than or equal to `watermark`. Useful for the
 * "already read" side of watermark comparisons.
 */
export function videoAtOrBeforeWatermark(watermark: Date): Prisma.VideoWhereInput {
  return {
    OR: [
      { published_at: { lte: watermark } },
      { AND: [{ published_at: null }, { created_at: { lte: watermark } }] },
    ],
  };
}

/**
 * Compute a video's effective publish date: `published_at` when present,
 * otherwise `created_at`. Use this in JS-side watermark comparisons so
 * null-date videos are treated consistently with the DB-side filters
 * above.
 */
export function effectivePublishDate(video: { published_at: Date | null; created_at: Date }): Date {
  return video.published_at ?? video.created_at;
}

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
  // recent_n_new. Ignore rows with null published_at — an unknown
  // timestamp can't anchor a "most recent N" cutoff.
  const cutoff = await prisma.video.findMany({
    where: { channel_id: channelId, published_at: { not: null } },
    select: { published_at: true },
    orderBy: { published_at: { sort: 'desc', nulls: 'last' } },
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
      ...(readAt != null ? videoNewerThanWatermark(readAt) : {}),
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
  handle: string | null;
  // Nullable to match the schema — platforms without a native RSS
  // feed (e.g. Bilibili) store null here.
  rss_url: string | null;
  logo_url: string | null;
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
      handle: string | null;
      rss_url: string | null;
      logo_url: string | null;
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
      c."handle"       AS handle,
      c."rss_url"      AS rss_url,
      c."logo_url"     AS logo_url,
      c."created_at"   AS created_at,
      COUNT(v."id")    AS unread_count
    FROM "UserSubscription" us
    JOIN "Channel" c ON c."id" = us."channel_id"
    LEFT JOIN "Video" v ON v."channel_id" = us."channel_id"
      AND (
        us."read_at" IS NULL
        OR COALESCE(v."published_at", v."created_at") > us."read_at"
      )
      AND NOT EXISTS (
        SELECT 1
        FROM "UserVideoConsumption" k
        WHERE k."video_id" = v."id" AND k."user_id" = us."user_id"
      )
    WHERE us."user_id" = ${userId}
    GROUP BY
      us."channel_id", us."read_at", us."folder_id", us."priority", us."mute_until",
      c."source_id", c."name", c."handle", c."rss_url", c."logo_url", c."created_at"
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
    handle: row.handle,
    rss_url: row.rss_url,
    logo_url: row.logo_url,
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
