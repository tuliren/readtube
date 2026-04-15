import type { PrismaClient } from '@readtube/database';

/**
 * Shared helpers for the star/save/archive endpoints. Each toggle delete
 * is a thin wrapper around `deleteMany` so repeated DELETE requests are
 * idempotent (not 404ing on second call), and each create uses the
 * user+video unique constraint for idempotency on the POST side.
 *
 * Every function takes `prisma` as its first argument instead of pulling
 * the prod singleton from `@/lib/db`. This mirrors the pattern already
 * used in `subscriptions.ts` and is the only way integration tests can
 * hit the testcontainers-backed database — if we imported the prod
 * singleton here, it would bind to the real `DATABASE_URL` at module
 * load time, before `beforeAll` can swap in the testcontainers URL.
 */

interface AssertArgs {
  userId: string;
  videoId: string;
}

/**
 * Returns true when the user can act on the video — either they have
 * a subscription to the video's channel, or they've added it directly
 * via the individual-video / playlist flow (StandaloneVideo row).
 * Used by every triage endpoint to prevent IDOR before touching state.
 */
export async function assertUserCanTouchVideo(
  prisma: PrismaClient,
  { userId, videoId }: AssertArgs
): Promise<boolean> {
  const row = await prisma.video.findFirst({
    where: {
      id: videoId,
      OR: [
        { channel: { subscriptions: { some: { user_id: userId } } } },
        { standalone: { some: { user_id: userId } } },
      ],
    },
    select: { id: true },
  });
  return row != null;
}

export async function starVideo(
  prisma: PrismaClient,
  userId: string,
  videoId: string
): Promise<void> {
  await prisma.videoStar.upsert({
    where: { video_star_unique_user_video: { user_id: userId, video_id: videoId } },
    create: { user_id: userId, video_id: videoId },
    update: {},
  });
}

export async function unstarVideo(
  prisma: PrismaClient,
  userId: string,
  videoId: string
): Promise<void> {
  await prisma.videoStar.deleteMany({
    where: { user_id: userId, video_id: videoId },
  });
}

export async function saveVideo(
  prisma: PrismaClient,
  userId: string,
  videoId: string
): Promise<void> {
  await prisma.videoSave.upsert({
    where: { video_save_unique_user_video: { user_id: userId, video_id: videoId } },
    create: { user_id: userId, video_id: videoId },
    update: {},
  });
}

export async function unsaveVideo(
  prisma: PrismaClient,
  userId: string,
  videoId: string
): Promise<void> {
  await prisma.videoSave.deleteMany({
    where: { user_id: userId, video_id: videoId },
  });
}

export async function archiveVideo(
  prisma: PrismaClient,
  userId: string,
  videoId: string
): Promise<void> {
  await prisma.videoArchive.upsert({
    where: { video_archive_unique_user_video: { user_id: userId, video_id: videoId } },
    create: { user_id: userId, video_id: videoId },
    update: {},
  });
}

export async function unarchiveVideo(
  prisma: PrismaClient,
  userId: string,
  videoId: string
): Promise<void> {
  await prisma.videoArchive.deleteMany({
    where: { user_id: userId, video_id: videoId },
  });
}

/**
 * Apply a bulk triage action across a set of video ids. Called by
 * /api/videos/bulk. Batches into one deleteMany/createMany per action
 * instead of N round-trips, and scopes to the user's owned videos to
 * prevent IDOR via a video id from another user's channel.
 */
export type BulkAction =
  | { type: 'mark_read' }
  | { type: 'star' }
  | { type: 'unstar' }
  | { type: 'save' }
  | { type: 'unsave' }
  | { type: 'archive' }
  | { type: 'unarchive' };

export async function applyBulk(
  prisma: PrismaClient,
  userId: string,
  videoIds: string[],
  action: BulkAction
): Promise<{ affected: number }> {
  if (videoIds.length === 0) {
    return { affected: 0 };
  }

  // Scope: only videos from channels the user is subscribed to. Anything
  // else is silently filtered. This keeps IDOR out of bulk without needing
  // to fail loudly on every stray id.
  const ownedVideos = await prisma.video.findMany({
    where: {
      id: { in: videoIds },
      channel: { subscriptions: { some: { user_id: userId } } },
    },
    select: { id: true },
  });
  const ownedIds = ownedVideos.map((v) => v.id);

  if (ownedIds.length === 0) {
    return { affected: 0 };
  }

  switch (action.type) {
    case 'mark_read': {
      // Reuse the existing consumption pattern rather than watermark bump
      // because bulk select is explicit and small (UI-driven), not a
      // "mark everything" action.
      const rows = ownedIds.map((id) => ({ user_id: userId, video_id: id }));
      await prisma.userVideoConsumption.createMany({
        data: rows,
        skipDuplicates: true,
      });
      return { affected: ownedIds.length };
    }
    case 'star': {
      await prisma.videoStar.createMany({
        data: ownedIds.map((id) => ({ user_id: userId, video_id: id })),
        skipDuplicates: true,
      });
      return { affected: ownedIds.length };
    }
    case 'unstar': {
      const result = await prisma.videoStar.deleteMany({
        where: { user_id: userId, video_id: { in: ownedIds } },
      });
      return { affected: result.count };
    }
    case 'save': {
      await prisma.videoSave.createMany({
        data: ownedIds.map((id) => ({ user_id: userId, video_id: id })),
        skipDuplicates: true,
      });
      return { affected: ownedIds.length };
    }
    case 'unsave': {
      const result = await prisma.videoSave.deleteMany({
        where: { user_id: userId, video_id: { in: ownedIds } },
      });
      return { affected: result.count };
    }
    case 'archive': {
      await prisma.videoArchive.createMany({
        data: ownedIds.map((id) => ({ user_id: userId, video_id: id })),
        skipDuplicates: true,
      });
      return { affected: ownedIds.length };
    }
    case 'unarchive': {
      const result = await prisma.videoArchive.deleteMany({
        where: { user_id: userId, video_id: { in: ownedIds } },
      });
      return { affected: result.count };
    }
  }
}
