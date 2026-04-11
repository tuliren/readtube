import { prisma } from '@readtube/database';
import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';

import { EMBEDDING_PROMPT_VERSION, embedVideo } from '@/lib/ai/embed';
import { isEmptyString } from '@/lib/string';

/**
 * Backfill / refresh pgvector embeddings. Picks up to BATCH_SIZE videos
 * that either don't have a VideoEmbedding row or whose prompt_version
 * is stale, embeds each via embedVideo(), and writes the row. Safe to
 * re-run — every call clamps at the batch size so a cold start won't
 * melt the AI gateway.
 */

const BATCH_SIZE = 25;

function verifyToken(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (isEmptyString(secret)) {
    return false;
  }
  const authHeader = request.headers.get('authorization');
  if (authHeader == null || !authHeader.startsWith('Bearer ')) {
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

  // Candidates: videos with no embedding row, plus videos whose stored
  // prompt_version has drifted from the current one.
  // We merge in two passes so the "no row" case doesn't need a LEFT JOIN.
  const missing = await prisma.video.findMany({
    where: { embedding: null },
    select: { id: true },
    take: BATCH_SIZE,
  });

  const stale = await prisma.videoEmbedding.findMany({
    where: { prompt_version: { not: EMBEDDING_PROMPT_VERSION } },
    select: { video_id: true },
    take: Math.max(0, BATCH_SIZE - missing.length),
  });

  const candidates = [...missing.map((v) => v.id), ...stale.map((s) => s.video_id)];

  let embedded = 0;
  const errors: { videoId: string; error: string }[] = [];
  for (const videoId of candidates) {
    try {
      const result = await embedVideo(videoId);
      if (!result.skipped) {
        embedded += 1;
      }
    } catch (err) {
      errors.push({
        videoId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return NextResponse.json({
    candidates: candidates.length,
    embedded,
    errors,
  });
}
