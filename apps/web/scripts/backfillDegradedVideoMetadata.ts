import { prisma } from '@readtube/database';

import {
  UNKNOWN_CHANNEL_NAME,
  UNKNOWN_VIDEO_TITLE,
  YOUTUBE_GENERIC_DESCRIPTION,
} from '@/lib/platforms/youtube/constants';
import { fetchVideoViaDataApi, isDataApiConfigured } from '@/lib/platforms/youtube/dataApi';

/**
 * Repairs YouTube rows stored from a degraded watch page before the
 * scraper learned to reject them: a blank or placeholder title,
 * YouTube's generic site description, or the placeholder channel
 * name. Re-fetches each affected video from the Data API and fills
 * only the fields that are missing or known-bad.
 *
 * Dry run by default; pass `--apply` to write.
 *
 *   yarn script:prod scripts/backfillDegradedVideoMetadata.ts
 *   yarn script:prod scripts/backfillDegradedVideoMetadata.ts -- --apply
 *
 * Re-running is safe: healed rows no longer match the query.
 */

const APPLY = process.argv.includes('--apply');

function isBlankTitle(title: string): boolean {
  return title.trim() === '' || title === UNKNOWN_VIDEO_TITLE;
}

function isBadDescription(description: string | null): boolean {
  return (
    description == null || description.trim() === '' || description === YOUTUBE_GENERIC_DESCRIPTION
  );
}

async function main() {
  if (!isDataApiConfigured()) {
    throw new Error('YOUTUBE_API_KEY is not set');
  }

  const videos = await prisma.video.findMany({
    where: {
      source_type: 'YOUTUBE',
      OR: [
        { title: '' },
        { title: UNKNOWN_VIDEO_TITLE },
        { description: YOUTUBE_GENERIC_DESCRIPTION },
        { channel: { name: UNKNOWN_CHANNEL_NAME } },
      ],
    },
    select: {
      id: true,
      source_id: true,
      title: true,
      description: true,
      published_at: true,
      duration_seconds: true,
      channel: { select: { id: true, name: true } },
    },
    orderBy: { created_at: 'asc' },
  });
  console.info(`${APPLY ? 'Applying' : 'Dry run'}: ${videos.length} candidate video(s)`);

  const healedChannelIds = new Set<string>();
  let updatedVideos = 0;
  let failed = 0;

  for (const v of videos) {
    const videoIsBad = isBlankTitle(v.title) || v.description === YOUTUBE_GENERIC_DESCRIPTION;
    const channelIsBad =
      v.channel.name === UNKNOWN_CHANNEL_NAME && !healedChannelIds.has(v.channel.id);
    if (!videoIsBad && !channelIsBad) {
      continue;
    }

    let snapshot;
    try {
      snapshot = await fetchVideoViaDataApi(v.source_id);
    } catch (err) {
      failed++;
      console.warn(`  ${v.id}: Data API fetch failed:`, err instanceof Error ? err.message : err);
      continue;
    }

    const videoData = {
      ...(isBlankTitle(v.title) ? { title: snapshot.title } : {}),
      // Also clears the generic text when the video has no description.
      ...(isBadDescription(v.description) && snapshot.description !== v.description
        ? { description: snapshot.description }
        : {}),
      ...(v.published_at == null && snapshot.publishedAt != null
        ? { published_at: snapshot.publishedAt }
        : {}),
      ...(v.duration_seconds == null && snapshot.durationSeconds != null
        ? { duration_seconds: snapshot.durationSeconds }
        : {}),
    };
    const channelName =
      channelIsBad && snapshot.channel.name !== UNKNOWN_CHANNEL_NAME ? snapshot.channel.name : null;

    // Ids only: titles and channel names are video content.
    console.info(
      `  ${v.id}: video fields [${Object.keys(videoData).join(', ')}]` +
        (channelName != null ? `; channel ${v.channel.id} name` : '')
    );

    if (APPLY) {
      if (Object.keys(videoData).length > 0) {
        await prisma.video.update({ where: { id: v.id }, data: videoData });
      }
      if (channelName != null) {
        await prisma.channel.update({ where: { id: v.channel.id }, data: { name: channelName } });
      }
    }
    if (Object.keys(videoData).length > 0) {
      updatedVideos++;
    }
    if (channelName != null) {
      healedChannelIds.add(v.channel.id);
    }
  }

  console.info(
    `${APPLY ? 'Updated' : 'Would update'} ${updatedVideos} video(s) and ` +
      `${healedChannelIds.size} channel(s); ${failed} fetch failure(s)`
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
