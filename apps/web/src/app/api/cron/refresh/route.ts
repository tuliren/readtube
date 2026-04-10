import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';

import { prisma } from '@/lib/db';
import { scrapeChannel } from '@/lib/youtube/scrapeChannel';

function verifyToken(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return false;
  }

  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return false;
  }

  const token = authHeader.slice(7);
  try {
    const secretBuf = new TextEncoder().encode(secret);
    const tokenBuf = new TextEncoder().encode(token);
    if (secretBuf.length !== tokenBuf.length) {
      return false;
    }
    return timingSafeEqual(secretBuf, tokenBuf);
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  if (!verifyToken(request)) {
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
            read_at: null,
          },
          update: {
            title: video.title,
            ...(video.description ? { description: video.description } : {}),
          },
        });
        totalNew++;
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
