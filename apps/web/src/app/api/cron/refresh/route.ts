import { prisma } from '@readtube/database';
import { NextRequest, NextResponse } from 'next/server';

import { verifyCronRequest } from '@/lib/cron';
import { isEmptyString } from '@/lib/string';
import { buildThumbnailUrl, fetchChannelLatest } from '@/lib/youtube/channelMetadata';
import { scrapeChannel } from '@/lib/youtube/scrapeChannel';

export async function POST(request: NextRequest) {
  if (!verifyCronRequest(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const channels = await prisma.channel.findMany({
    select: { id: true, source_id: true, rss_url: true },
  });

  let totalNew = 0;
  let errors = 0;

  for (const channel of channels) {
    try {
      const channelPageUrl = `https://www.youtube.com/channel/${channel.source_id}`;
      const scraped = await scrapeChannel(channelPageUrl);

      for (const video of scraped.videos) {
        await prisma.video.upsert({
          where: {
            video_unique_channel_source: {
              channel_id: channel.id,
              source_id: video.videoId,
            },
          },
          create: {
            channel_id: channel.id,
            source_id: video.videoId,
            title: video.title,
            description: video.description,
            published_at: video.publishedAt,
            duration_seconds: video.durationSeconds,
          },
          update: {
            title: video.title,
            // Only update description if the scraper produced a non-empty value.
            // Shelf-scraped videos hardcode description to '', and we don't want
            // to clobber a real description that was captured earlier.
            ...(isEmptyString(video.description) ? {} : { description: video.description }),
            // Backfill duration on existing rows the moment we see a real
            // value, but never clobber a known duration with null — that
            // way a one-off scraper shape change can't blank out the
            // duration of every video in the channel.
            ...(video.durationSeconds != null ? { duration_seconds: video.durationSeconds } : {}),
          },
        });
        totalNew++;
      }

      // Best-effort metadata enrichment via TranscriptAPI's RSS
      // endpoint. Backfills thumbnail + viewCount on videos that were
      // just upserted from the scraper's output. Falls back to
      // constructing thumbnail URLs from videoId directly.
      try {
        const meta = await fetchChannelLatest(channel.source_id);
        for (const videoMeta of meta.videos) {
          await prisma.video.updateMany({
            where: { channel_id: channel.id, source_id: videoMeta.videoId },
            data: {
              thumbnail_url: videoMeta.thumbnailUrl,
              ...(videoMeta.viewCount != null ? { view_count: videoMeta.viewCount } : {}),
            },
          });
        }
      } catch (metaErr) {
        console.warn(
          `[cron/refresh] TranscriptAPI enrichment failed for ${channel.id}, using fallback thumbnails:`,
          metaErr
        );
        for (const video of scraped.videos) {
          await prisma.video.updateMany({
            where: { channel_id: channel.id, source_id: video.videoId },
            data: { thumbnail_url: buildThumbnailUrl(video.videoId) },
          });
        }
      }
    } catch (err) {
      errors++;
      console.error(`[cron/refresh] Failed to refresh channel ${channel.id}:`, err);
    }
  }

  console.log(
    `[cron/refresh] Done. channels=${channels.length} videos_processed=${totalNew} errors=${errors}`
  );

  return NextResponse.json({ channels: channels.length, videosProcessed: totalNew, errors });
}
