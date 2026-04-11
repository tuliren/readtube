import type { Prisma } from '@readtube/database';

import type { InboxQuery } from '@/lib/types';

/**
 * Build a Prisma `Video.where` clause for the authenticated user's inbox,
 * honoring the filter state captured in `query`. This is the one place the
 * list endpoint, search endpoint, bulk endpoint, and saved-view runner all
 * go through, so filter semantics stay consistent.
 *
 * Callers MUST provide `userId` and `channelIds` (the list of channels the
 * user is subscribed to) so we can enforce IDOR protection at the DB layer.
 *
 * Triage rules:
 * - `archived` defaults to excluding archived videos; set archived=true to
 *   show only archived.
 * - `includeSnoozed` defaults to false — snoozed videos are hidden from the
 *   inbox until their snooze_until has passed.
 * - `starred` / `saved` = true restricts to videos with a row in the matching
 *   table for this user.
 * - `unread` filtering is applied in the consumer (where the watermark map
 *   is available), not here.
 */
export function buildVideoWhere(
  query: InboxQuery,
  userId: string,
  channelIds: string[]
): Prisma.VideoWhereInput {
  const where: Prisma.VideoWhereInput = {};

  // Scope to the user's subscribed channels. If a specific channelId is
  // passed, validate membership (caller should ensure this, but be safe).
  if (query.channelId != null && channelIds.includes(query.channelId)) {
    where.channel_id = query.channelId;
  } else {
    where.channel_id = { in: channelIds };
  }

  // Date window
  if (query.from != null || query.to != null) {
    where.published_at = {};
    if (query.from != null) {
      where.published_at.gte = new Date(query.from);
    }
    if (query.to != null) {
      where.published_at.lte = new Date(query.to);
    }
  }

  // Tags: ALL selected tags must match (implicit AND). Rare to want OR here;
  // if it ever comes up, add a `tagMatch: 'any'|'all'` flag.
  if (query.tagIds != null && query.tagIds.length > 0) {
    where.AND = query.tagIds.map((tagId) => ({
      tags: { some: { tag_id: tagId, user_id: userId } },
    }));
  }

  // Triage: archived is a hard exclude by default; set archived=true to flip
  // into the archived view.
  if (query.archived === true) {
    where.archives = { some: { user_id: userId } };
  } else {
    where.archives = { none: { user_id: userId } };
  }

  // Snoozed videos are hidden unless explicitly requested or the snooze has
  // passed. We model "hidden" as NOT (has active snooze for this user).
  if (query.includeSnoozed !== true) {
    where.snoozes = {
      none: {
        user_id: userId,
        snooze_until: { gt: new Date() },
      },
    };
  }

  if (query.starred === true) {
    where.stars = { some: { user_id: userId } };
  }

  if (query.saved === true) {
    where.saves = { some: { user_id: userId } };
  }

  return where;
}
