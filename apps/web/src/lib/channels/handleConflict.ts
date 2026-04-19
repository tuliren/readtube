import { type PrismaClient, VideoPlatformType } from '@readtube/database';

import { isEmptyString } from '@/lib/string';

/**
 * Returns true if another Channel row on the same platform already
 * owns `handle` (i.e. a different channel than the one we're about
 * to create/update). Used to guard channel upserts/updates against
 * the `@@unique([source_type, handle])` constraint — if a stale row
 * or a channel that upstream renamed happens to already have the
 * scraped handle, we skip writing it on the current channel.
 *
 * The unique constraint is scoped by `source_type`, so the check is
 * too. Callers should pass the owning platform's source_type;
 * defaults to YOUTUBE to keep legacy callers working (Bilibili has
 * no handle convention and always passes a null handle that
 * short-circuits below).
 *
 * Pass `excludeChannelId` (DB id) when you have the row you're
 * updating. Pass `null` when you're creating a new row and want to
 * check against every existing channel.
 */
export async function hasChannelHandleConflict(
  prisma: PrismaClient,
  handle: string | null | undefined,
  excludeChannelId: string | null,
  sourceType: VideoPlatformType = VideoPlatformType.YOUTUBE
): Promise<boolean> {
  if (isEmptyString(handle)) {
    return false;
  }
  const row = await prisma.channel.findFirst({
    where: {
      source_type: sourceType,
      handle,
      ...(excludeChannelId != null ? { NOT: { id: excludeChannelId } } : {}),
    },
    select: { id: true },
  });
  return row != null;
}
