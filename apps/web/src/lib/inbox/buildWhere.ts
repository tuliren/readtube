import type { Prisma } from '@readtube/database';

import { videoNewerThanWatermark } from '@/lib/subscriptions';
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
 *   show only archived. The Starred and Read Later views are exempt from
 *   that default exclusion — see below.
 * - `starred` / `saved` = true restricts to videos with a row in the matching
 *   table for this user.
 * - `unread` filtering needs the per-channel read-at watermark map and so
 *   lives in `buildUnreadClause` below — callers AND it onto the result of
 *   `buildVideoWhere` when `query.unread === true`. It used to be a JS
 *   post-filter in the route handler, but combined with `take: N` that
 *   silently dropped unread videos beyond the cap.
 *
 * Scoping rule: the mark-scoped views (Starred / Read Later / Archived)
 * drop the channel scope — see `isMarkScopedQuery`.
 */
export function buildVideoWhere(
  query: InboxQuery,
  userId: string,
  channelIds: string[],
  options: { skipChannelScope?: boolean } = {}
): Prisma.VideoWhereInput {
  const where: Prisma.VideoWhereInput = {};

  // Scope to the user's subscribed channels. If a specific channelId is
  // passed, validate membership (caller should ensure this, but be safe).
  // Library scopes skip this and restrict to a pre-computed id set at
  // the caller instead — the standalone / playlist views don't live on
  // the channel axis at all. Mark-scoped views skip it too: their own
  // `{ some: { user_id } }` filter is the scope (and the IDOR guard).
  if (!options.skipChannelScope) {
    if (query.channelId != null && channelIds.includes(query.channelId)) {
      where.channel_id = query.channelId;
    } else if (!isMarkScopedQuery(query)) {
      where.channel_id = { in: channelIds };
    }
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

  // Triage: archived is a hard exclude by default; set archived=true to flip
  // into the archived view.
  //
  // Starred and Read Later are exempt from the default exclusion.
  // Archiving means "get this out of my inbox", so it belongs to the
  // feed views — it shouldn't quietly empty a bucket the user put the
  // video into by hand. Archiving a starred video is a normal way to
  // clear it from the inbox while keeping the star, and the Starred
  // view has to keep showing it. `archived=true` still wins when both
  // are set, giving the archived ∩ starred intersection.
  if (query.archived === true) {
    where.archives = { some: { user_id: userId } };
  } else if (query.starred !== true && query.saved !== true) {
    where.archives = { none: { user_id: userId } };
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
 * True when the query is anchored on one of the user's own per-video
 * marks — the Starred, Read Later, and Archived views.
 *
 * Those views are deliberately NOT scoped to the user's subscribed
 * channels. A star, a Read Later save, or an archive is a statement
 * about that one video, so the bucket should hold everything the user
 * put in it: videos from a channel they later removed (whose marks
 * `unsubscribeChannelForUser` now keeps) and videos in their personal
 * library, not just videos that happen to sit under a live
 * subscription. The mark filter is a per-user relation check, so
 * dropping the channel scope can't widen the result past this user's
 * own rows.
 *
 * The Inbox and Unread views stay channel-scoped: they're the
 * subscription feed, and a removed channel should not keep publishing
 * into them.
 */
export function isMarkScopedQuery(query: InboxQuery): boolean {
  return query.starred === true || query.saved === true || query.archived === true;
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
 *
 * `includeUnscopedChannels` widens rule 2 to videos outside the user's
 * subscriptions — set it whenever the surrounding query is mark-scoped
 * (see `isMarkScopedQuery`), so "starred and unread" still reaches a
 * kept video whose channel the user removed. Such a channel has no
 * watermark, so those videos read as unread until an explicit
 * consumption row says otherwise.
 */
export function buildUnreadClause(
  userId: string,
  channelIds: string[],
  watermarkByChannelId: Map<string, Date | null>,
  options: { includeUnscopedChannels?: boolean } = {}
): Prisma.VideoWhereInput {
  // Per-channel watermark predicate. For each channel either there's
  // no watermark (every video in that channel is above the line) or
  // we want only videos published strictly after the watermark.
  const perChannel: Prisma.VideoWhereInput[] = channelIds.map((cid) => {
    const watermark = watermarkByChannelId.get(cid) ?? null;
    if (watermark == null) {
      return { channel_id: cid };
    }
    return { channel_id: cid, ...videoNewerThanWatermark(watermark) };
  });

  if (options.includeUnscopedChannels === true) {
    // Everything outside the subscribed set has no watermark to clear.
    // Spelled out rather than leaning on `notIn: []`, whose "matches
    // everything" reading is the same empty-array surprise that makes
    // a bare `OR: []` match everything.
    perChannel.push(channelIds.length === 0 ? {} : { channel_id: { notIn: channelIds } });
  }

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
