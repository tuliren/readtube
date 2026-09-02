import { Prisma } from '@readtube/database';

/**
 * A video's **special marks** — the deliberate, user-authored signals
 * that the user wants to keep the video around:
 *
 *   - `VideoStar`  the user starred it (favorite)
 *   - `VideoSave`  the user saved it for later
 *   - `Note`       the user annotated it
 *
 * `VideoArchive` and `UserVideoConsumption` are intentionally NOT
 * marks. Archiving is a dismissal ("get this out of my inbox") and a
 * consumption row is just read state — neither expresses "keep this".
 * Treating them as marks would mean an aggressive triager could never
 * actually shed a channel's backlog by unsubscribing. Archive and read
 * state are still preserved for videos that are kept for one of the
 * reasons above, so a kept video that was archived stays archived.
 *
 * Marks are what makes a video survive `unsubscribeChannelForUser`:
 * dropping a subscription wipes the user's per-video state for that
 * channel, except for videos the user marked (or added to their
 * library). Because a marked video outlives its subscription, every
 * access check and every mark-scoped view has to treat "the user
 * marked it" as a first-class reason to reach a video — otherwise the
 * rows we kept would be invisible and un-actionable.
 */

/** One `Video.where` arm per mark table. */
function markArms(userId: string): Prisma.VideoWhereInput[] {
  return [
    { stars: { some: { user_id: userId } } },
    { saves: { some: { user_id: userId } } },
    { notes: { some: { user_id: userId } } },
  ];
}

/**
 * Prisma `Video.where` fragment matching every video the user can
 * legitimately reach: one from a channel they subscribe to, one in
 * their personal library (standalone add or a playlist they own), or
 * one they marked. This is the IDOR guard shared by the reader page,
 * the triage endpoints, the bulk endpoint, and the content endpoints
 * (transcript / summary / article / read / meta) — they must not
 * diverge, or a video would open in the reader but 404 on its
 * transcript, or be visible in a list but 404 on the action.
 */
export function videoReachableByUser(userId: string): Prisma.VideoWhereInput {
  return {
    OR: [
      { channel: { subscriptions: { some: { user_id: userId } } } },
      { standalone: { some: { user_id: userId } } },
      { playlist_items: { some: { playlist: { user_id: userId } } } },
      ...markArms(userId),
    ],
  };
}

/**
 * Raw-SQL counterpart of the mark arms above, for the `$queryRaw`
 * search paths that can't go through the generated client.
 * `videoIdColumn` is the qualified id column of the `Video` row being
 * tested, e.g. ``Prisma.sql`v."id"` ``.
 */
export function videoMarkedByUserSql(userId: string, videoIdColumn: Prisma.Sql): Prisma.Sql {
  return Prisma.sql`(
    EXISTS (
      SELECT 1 FROM "VideoStar" mark_star
      WHERE mark_star."video_id" = ${videoIdColumn} AND mark_star."user_id" = ${userId}
    )
    OR EXISTS (
      SELECT 1 FROM "VideoSave" mark_save
      WHERE mark_save."video_id" = ${videoIdColumn} AND mark_save."user_id" = ${userId}
    )
    OR EXISTS (
      SELECT 1 FROM "Note" mark_note
      WHERE mark_note."video_id" = ${videoIdColumn} AND mark_note."user_id" = ${userId}
    )
  )`;
}
