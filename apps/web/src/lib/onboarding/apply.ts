import type { PrismaClient } from '@readtube/database';

import { platformLabel, trackContentAdded } from '@/lib/analytics/events';
import { computeInitialReadAt } from '@/lib/subscriptions';

import { FOLLOWABLE_CHANNEL, OFFERABLE_VIDEO } from './suggestions';
import type { OnboardingResult, OnboardingSelection } from './types';

/**
 * Cap on ids per list in one request. The page offers at most
 * `CHANNEL_SUGGESTION_LIMIT` / `VIDEO_SUGGESTION_LIMIT`, so anything
 * beyond this is not a real client.
 */
export const MAX_ONBOARDING_SELECTION = 100;

/**
 * Validate the `POST /api/onboarding` body: two arrays of non-empty id
 * strings, de-duplicated, at least one id overall and at most
 * {@link MAX_ONBOARDING_SELECTION} per list. Returns null when the body
 * doesn't fit that shape.
 */
export function parseOnboardingSelection(body: unknown): OnboardingSelection | null {
  if (body == null || typeof body !== 'object') {
    return null;
  }
  const { channelIds, videoIds } = body as Record<string, unknown>;
  const channels = parseIdList(channelIds ?? []);
  const videos = parseIdList(videoIds ?? []);
  if (channels == null || videos == null) {
    return null;
  }
  if (channels.length === 0 && videos.length === 0) {
    return null;
  }
  return { channelIds: channels, videoIds: videos };
}

function parseIdList(value: unknown): string[] | null {
  if (!Array.isArray(value)) {
    return null;
  }
  if (!value.every((id): id is string => typeof id === 'string' && id.trim() !== '')) {
    return null;
  }
  const unique = Array.from(new Set(value));
  if (unique.length > MAX_ONBOARDING_SELECTION) {
    return null;
  }
  return unique;
}

/**
 * Follow the picked channels and add the picked videos to the user's
 * library, straight from rows already in the database (no upstream
 * fetch, unlike the Add dialog's paths).
 *
 * Ids that don't name an eligible row are skipped rather than failing
 * the whole request: only `FOLLOWABLE_CHANNEL` channels (the same set the
 * page offers) can be followed this way, since a shadow channel would
 * subscribe the user to an empty feed; and only videos with generated
 * content can be added. Re-applying the same selection is a no-op.
 *
 * Videos are left unread, unlike a pasted video link, which is marked
 * read because the user is about to open it. Here the user is picking
 * what to read next, and the unread badge is how they find it again.
 */
export async function applyOnboardingSelection(
  prisma: PrismaClient,
  userId: string,
  selection: OnboardingSelection
): Promise<OnboardingResult> {
  const [channels, videos] = await Promise.all([
    selection.channelIds.length === 0
      ? []
      : prisma.channel.findMany({
          where: {
            id: { in: selection.channelIds },
            ...FOLLOWABLE_CHANNEL,
          },
          select: {
            id: true,
            source_type: true,
            subscriptions: { where: { user_id: userId }, select: { id: true } },
          },
        }),
    selection.videoIds.length === 0
      ? []
      : prisma.video.findMany({
          where: { id: { in: selection.videoIds }, ...OFFERABLE_VIDEO },
          select: {
            id: true,
            source_type: true,
            standalone: { where: { user_id: userId }, select: { id: true } },
          },
        }),
  ]);

  const newChannels = channels.filter((c) => c.subscriptions.length === 0);
  // Channels are independent, so follow them in parallel rather than
  // two round trips per channel in series.
  await Promise.all(
    newChannels.map(async (channel) => {
      const readAt = await computeInitialReadAt(prisma, channel.id);
      // Same initial watermark as the Add dialog. Upsert so a concurrent
      // follow from another tab is a no-op instead of a unique violation.
      await prisma.userSubscription.upsert({
        where: {
          subscription_unique_user_channel: { user_id: userId, channel_id: channel.id },
        },
        create: { user_id: userId, channel_id: channel.id, read_at: readAt },
        update: {},
      });
    })
  );

  const newVideos = videos.filter((v) => v.standalone.length === 0);
  if (newVideos.length > 0) {
    await prisma.standaloneVideo.createMany({
      data: newVideos.map((v) => ({ user_id: userId, video_id: v.id })),
      skipDuplicates: true,
    });
  }

  await Promise.all([
    ...newChannels.map((c) => trackContentAdded('channel', platformLabel(c.source_type))),
    ...newVideos.map((v) => trackContentAdded('video', platformLabel(v.source_type))),
  ]);

  return { followedChannels: newChannels.length, addedVideos: newVideos.length };
}
