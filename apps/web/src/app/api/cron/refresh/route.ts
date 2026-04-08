import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';

import { prisma } from '@/lib/db';
import { fetchRssFeed } from '@/lib/youtube/rss';

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
    select: { id: true, rssUrl: true, userId: true },
  });

  let totalNew = 0;
  let errors = 0;

  for (const channel of channels) {
    try {
      const feed = await fetchRssFeed(channel.rssUrl);

      for (const video of feed.videos) {
        await prisma.video.upsert({
          where: {
            channelId_videoId: {
              channelId: channel.id,
              videoId: video.videoId,
            },
          },
          create: {
            channelId: channel.id,
            videoId: video.videoId,
            title: video.title,
            description: video.description,
            publishedAt: video.publishedAt,
            readAt: null, // new videos from cron are unread
          },
          update: {
            title: video.title,
            description: video.description,
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
