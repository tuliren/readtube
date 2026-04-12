import { auth } from '@clerk/nextjs/server';
import { prisma } from '@readtube/database';
import { NextRequest, NextResponse } from 'next/server';

import { isEmptyString } from '@/lib/string';
import { fetchChannelLatest } from '@/lib/youtube/channelMetadata';
import { scrapeChannel } from '@/lib/youtube/scrapeChannel';

/**
 * POST /api/channels/[id]/refresh
 *
 * Dev-only single-channel refresh. Scrapes the latest videos from the
 * channel's YouTube page, then enriches with TranscriptAPI metadata
 * (logo, thumbnails, view counts). Returns the updated channel +
 * counts so the caller can invalidate its SWR caches.
 *
 * Gated to authenticated users who own the subscription — but the
 * UI button is only shown in dev environments via `isProduction()`.
 */
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (userId == null) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id: channelId } = await params;

  // IDOR check: the user must be subscribed to this channel.
  const sub = await prisma.userSubscription.findFirst({
    where: { user_id: userId, channel_id: channelId },
    select: { channel_id: true },
  });
  if (sub == null) {
    return NextResponse.json({ error: 'Channel not found' }, { status: 404 });
  }

  const channel = await prisma.channel.findUniqueOrThrow({
    where: { id: channelId },
    select: { id: true, source_id: true },
  });

  let videosProcessed = 0;

  // Step 1: scrape latest videos from YouTube.
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
          ...(isEmptyString(video.description) ? {} : { description: video.description }),
          ...(video.durationSeconds != null ? { duration_seconds: video.durationSeconds } : {}),
        },
      });
      videosProcessed++;
    }
  } catch (err) {
    console.error(`[channels/refresh] scrape failed for ${channelId}:`, err);
    return NextResponse.json(
      { error: 'Failed to scrape channel. Check the console for details.' },
      { status: 500 }
    );
  }

  // Step 2: enrich with TranscriptAPI metadata (best-effort).
  try {
    const meta = await fetchChannelLatest(channel.source_id);
    await prisma.channel.update({
      where: { id: channel.id },
      data: {
        handle: meta.channel.handle,
        description: meta.channel.description,
        subscriber_count: meta.channel.subscriberCount,
        verified: meta.channel.verified,
        logo_url: meta.channel.logoUrl,
      },
    });
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
    console.warn(`[channels/refresh] metadata enrichment failed for ${channelId}:`, metaErr);
    // Proceed — the scrape data is already saved.
  }

  return NextResponse.json({ channelId, videosProcessed });
}
