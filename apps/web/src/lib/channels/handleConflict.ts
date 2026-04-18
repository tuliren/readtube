import { type PrismaClient, VideoPlatformType } from '@readtube/database';

import { isEmptyString } from '@/lib/string';

/**
 * Returns true if another Channel row already owns `handle` (i.e. a
 * different channel than the one we're about to create/update). Used
 * to guard channel upserts/updates against the
 * `@@unique([source_type, handle])` constraint — if a stale row or a
 * channel that upstream renamed happens to already have the scraped
 * handle, we skip writing it on the current channel.
 *
 * Pass `excludeChannelId` (DB id) when you have the row you're
 * updating. Pass `null` when you're creating a new row and want to
 * check against every existing channel.
 */
export async function hasChannelHandleConflict(
  prisma: PrismaClient,
  handle: string | null | undefined,
  excludeChannelId: string | null
): Promise<boolean> {
  if (isEmptyString(handle)) {
    return false;
  }
  const row = await prisma.channel.findFirst({
    where: {
      source_type: VideoPlatformType.YOUTUBE,
      handle,
      ...(excludeChannelId != null ? { NOT: { id: excludeChannelId } } : {}),
    },
    select: { id: true },
  });
  return row != null;
}
