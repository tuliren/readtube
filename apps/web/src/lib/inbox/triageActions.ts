import { prisma } from '@/lib/db';

/**
 * Shared helpers for the star/save/archive endpoints. Each toggle delete
 * is a thin wrapper around `deleteMany` so repeated DELETE requests are
 * idempotent (not 404ing on second call), and each create uses the
 * user+video unique constraint for idempotency on the POST side.
 */

interface AssertArgs {
  userId: string;
  videoId: string;
}

/**
 * Returns true when the user has a subscription whose channel owns the
 * given video. Used by every triage endpoint to prevent IDOR before
 * touching state. A single JOIN, no separate findFirst round-trips.
 */
export async function assertUserCanTouchVideo({ userId, videoId }: AssertArgs): Promise<boolean> {
  const row = await prisma.video.findFirst({
    where: {
      id: videoId,
      channel: { subscriptions: { some: { user_id: userId } } },
    },
    select: { id: true },
  });
  return row != null;
}

export async function starVideo(userId: string, videoId: string): Promise<void> {
  await prisma.videoStar.upsert({
    where: { video_star_unique_user_video: { user_id: userId, video_id: videoId } },
    create: { user_id: userId, video_id: videoId },
    update: {},
  });
}

export async function unstarVideo(userId: string, videoId: string): Promise<void> {
  await prisma.videoStar.deleteMany({
    where: { user_id: userId, video_id: videoId },
  });
}

export async function saveVideo(userId: string, videoId: string): Promise<void> {
  await prisma.videoSave.upsert({
    where: { video_save_unique_user_video: { user_id: userId, video_id: videoId } },
    create: { user_id: userId, video_id: videoId },
    update: {},
  });
}

export async function unsaveVideo(userId: string, videoId: string): Promise<void> {
  await prisma.videoSave.deleteMany({
    where: { user_id: userId, video_id: videoId },
  });
}

export async function archiveVideo(userId: string, videoId: string): Promise<void> {
  await prisma.videoArchive.upsert({
    where: { video_archive_unique_user_video: { user_id: userId, video_id: videoId } },
    create: { user_id: userId, video_id: videoId },
    update: {},
  });
}

export async function unarchiveVideo(userId: string, videoId: string): Promise<void> {
  await prisma.videoArchive.deleteMany({
    where: { user_id: userId, video_id: videoId },
  });
}

export async function snoozeVideo(
  userId: string,
  videoId: string,
  snoozeUntil: Date
): Promise<void> {
  await prisma.videoSnooze.upsert({
    where: { video_snooze_unique_user_video: { user_id: userId, video_id: videoId } },
    create: { user_id: userId, video_id: videoId, snooze_until: snoozeUntil },
    update: { snooze_until: snoozeUntil },
  });
}

export async function unsnoozeVideo(userId: string, videoId: string): Promise<void> {
  await prisma.videoSnooze.deleteMany({
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
  | { type: 'unarchive' }
  | { type: 'snooze'; snoozeUntil: string };

export async function applyBulk(
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
    case 'snooze': {
      const until = new Date(action.snoozeUntil);
      // createMany with skipDuplicates would leave the existing row
      // untouched, so loop upserts here to preserve the "update the date"
      // behavior a user expects from re-snoozing.
      for (const id of ownedIds) {
        await snoozeVideo(userId, id, until);
      }
      return { affected: ownedIds.length };
    }
  }
}
