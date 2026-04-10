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
