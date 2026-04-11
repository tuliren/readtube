import { prisma } from '@/lib/db';

import type { RuleAction } from './evaluate';

/**
 * Apply rule actions to the DB for a specific (user, video) pair.
 * Separated from the pure evaluator so tests can stay mock-free and
 * route handlers can batch or log side effects independently.
 *
 * Actions are idempotent via the user+video unique indices on each
 * triage table (upsert-ish via createMany + skipDuplicates), so running
 * the same rule twice on the same video is safe.
 */
export async function applyRuleActions(
  userId: string,
  videoId: string,
  actions: RuleAction[]
): Promise<void> {
  if (actions.length === 0) {
    return;
  }

  for (const action of actions) {
    switch (action.type) {
      case 'mark_read':
        await prisma.userVideoConsumption.upsert({
          where: {
            user_video_consumption_unique_user_video: { user_id: userId, video_id: videoId },
          },
          create: { user_id: userId, video_id: videoId },
          update: {},
        });
        break;
      case 'star':
        await prisma.videoStar.upsert({
          where: { video_star_unique_user_video: { user_id: userId, video_id: videoId } },
          create: { user_id: userId, video_id: videoId },
          update: {},
        });
        break;
      case 'save':
        await prisma.videoSave.upsert({
          where: { video_save_unique_user_video: { user_id: userId, video_id: videoId } },
          create: { user_id: userId, video_id: videoId },
          update: {},
        });
        break;
      case 'archive':
        await prisma.videoArchive.upsert({
          where: { video_archive_unique_user_video: { user_id: userId, video_id: videoId } },
          create: { user_id: userId, video_id: videoId },
          update: {},
        });
        break;
      case 'snooze': {
        const offsetMs = action.payload?.snoozeUntilOffsetMs ?? 24 * 60 * 60 * 1000;
        const until = new Date(Date.now() + offsetMs);
        await prisma.videoSnooze.upsert({
          where: { video_snooze_unique_user_video: { user_id: userId, video_id: videoId } },
          create: { user_id: userId, video_id: videoId, snooze_until: until },
          update: { snooze_until: until },
        });
        break;
      }
      case 'tag': {
        const tagName = action.payload?.tagName?.trim();
        if (tagName == null || tagName.length === 0) {
          break;
        }
        // Upsert the tag row, then upsert the junction row. Two
        // upserts instead of one to keep tag uniqueness enforced at
        // the DB layer.
        const tag = await prisma.tag.upsert({
          where: { tag_unique_user_name: { user_id: userId, name: tagName } },
          create: { user_id: userId, name: tagName },
          update: {},
          select: { id: true },
        });
        await prisma.videoTag.upsert({
          where: {
            video_tag_unique_user_video_tag: {
              user_id: userId,
              video_id: videoId,
              tag_id: tag.id,
            },
          },
          create: {
            user_id: userId,
            video_id: videoId,
            tag_id: tag.id,
            source: 'AUTO_RULE',
          },
          update: {},
        });
        break;
      }
    }
  }
}
