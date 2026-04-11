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
 * - `snoozed=true` produces a snoozed-only view (powers the sidebar's
 *   Snoozed pseudo-view). `includeSnoozed` defaults to false and mixes
 *   snoozed videos back into the main feed without hiding anything else.
 *   `snoozed=true` wins over `includeSnoozed` when both are set.
 * - `starred` / `saved` = true restricts to videos with a row in the matching
 *   table for this user.
 * - `unread` filtering needs the per-channel read-at watermark map and so
 *   lives in `buildUnreadClause` below — callers AND it onto the result of
 *   `buildVideoWhere` when `query.unread === true`. It used to be a JS
 *   post-filter in the route handler, but combined with `take: N` that
 *   silently dropped unread videos beyond the cap.
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

  // Snooze has three modes:
  //   1. snoozed=true → show ONLY currently-active snoozes (dedicated view)
  //   2. includeSnoozed=true → show everything, including active snoozes
  //   3. default → hide active snoozes from the main feed
  if (query.snoozed === true) {
    where.snoozes = {
      some: {
        user_id: userId,
        snooze_until: { gt: new Date() },
      },
    };
  } else if (query.includeSnoozed !== true) {
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

/**
 * Predicate that selects only videos which are unread for the given
 * user. A video is "unread" iff:
 *   1. There is no Consumption row marking it read for this user, AND
 *   2. Its publish date is strictly after the user's per-channel read-at
 *      watermark (or that channel has no watermark set yet).
 *
 * This used to be a JS post-filter in `/api/videos/route.ts` applied
 * AFTER `take: 500`, which silently dropped genuinely unread videos
 * beyond the cap whenever the user had a long backlog of read items
 * mixed in. Pushing the predicate into the DB query means `take`
 * applies to the already-filtered set.
 *
 * Returned as a standalone clause (not folded into `buildVideoWhere`)
 * because it needs the watermark map, which the buildVideoWhere
 * callsite doesn't always have on hand.
 */
export function buildUnreadClause(
  userId: string,
  channelIds: string[],
  watermarkByChannelId: Map<string, Date | null>
): Prisma.VideoWhereInput {
  // Per-channel watermark predicate. For each channel either there's
  // no watermark (every video in that channel is above the line) or
  // we want only videos published strictly after the watermark.
  const perChannel: Prisma.VideoWhereInput[] = channelIds.map((cid) => {
    const watermark = watermarkByChannelId.get(cid) ?? null;
    if (watermark == null) {
      return { channel_id: cid };
    }
    return { channel_id: cid, published_at: { gt: watermark } };
  });

  return {
    AND: [
      // Above the per-channel watermark
      { OR: perChannel },
      // No Consumption row at all for this (user, video). The schema
      // declares `read_at DateTime @default(now())` (non-nullable), so
      // the existence of a row already means "marked read" — no need
      // to additionally filter on read_at.
      { consumptions: { none: { user_id: userId } } },
    ],
  };
}
