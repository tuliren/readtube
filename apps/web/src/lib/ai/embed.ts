import { prisma } from '@readtube/database';
import { embed } from 'ai';
import { randomUUID } from 'node:crypto';

import { DEFAULT_EMBEDDING_MODEL } from '@/constants';

/**
 * Version stamp for the embedding input recipe. Bump whenever the text we
 * feed the embedder changes — the cron will re-embed any video whose stored
 * version is stale. Keeping this as a string (not an env var) means a simple
 * code change forces regeneration without a separate deploy step.
 */
export const EMBEDDING_PROMPT_VERSION = 'v1';

interface EmbedResult {
  skipped: boolean;
  reason?: string;
}

/**
 * Compute and upsert an embedding for a single video. Safe to call
 * repeatedly — no-ops when a fresh-enough row already exists. Called from
 * the ingest cron (after scrapeChannel) and the summary route (after a
 * summary is generated, since the summary is part of the embedding input).
 *
 * Input recipe: title + channel name + summary (full > short > headline).
 * Description is excluded because it's noisy on YouTube (boilerplate links,
 * promo copy) and the summary is a better distillation when available.
 */
export async function embedVideo(videoId: string): Promise<EmbedResult> {
  const existing = await prisma.videoEmbedding.findUnique({
    where: { video_id: videoId },
    select: { prompt_version: true },
  });
  if (existing != null && existing.prompt_version === EMBEDDING_PROMPT_VERSION) {
    return { skipped: true, reason: 'already-fresh' };
  }

  const video = await prisma.video.findUnique({
    where: { id: videoId },
    select: {
      id: true,
      title: true,
      channel: { select: { name: true } },
      transcripts: {
        select: {
          // Embed against the Original (language IS NULL) summary so
          // semantic search keys on the canonical text rather than
          // whatever translation happened to land first.
          summaries: {
            where: { language: null },
            take: 1,
            select: { full: true, short: true, headline: true },
          },
        },
        orderBy: { created_at: 'desc' },
        take: 1,
      },
    },
  });
  if (video == null) {
    return { skipped: true, reason: 'video-missing' };
  }

  const summary = video.transcripts[0]?.summaries[0];
  const summaryText = summary?.full ?? summary?.short ?? summary?.headline ?? '';
  const input = [
    `Title: ${video.title}`,
    `Channel: ${video.channel.name}`,
    summaryText.length > 0 ? `Summary: ${summaryText}` : null,
  ]
    .filter((line) => line != null)
    .join('\n');

  const { embedding } = await embed({
    model: DEFAULT_EMBEDDING_MODEL,
    value: input,
  });

  // Unsupported("vector(1536)") can't be written through Prisma's generated
  // client — fall through to raw SQL. The ::vector cast forces Postgres to
  // parse the array literal as pgvector instead of a text column.
  const vectorLiteral = `[${embedding.join(',')}]`;
  const rowId = randomUUID();

  await prisma.$executeRaw`
    INSERT INTO "VideoEmbedding" ("id", "video_id", "embedding", "model", "prompt_version", "generated_at")
    VALUES (
      ${rowId},
      ${video.id},
      ${vectorLiteral}::vector,
      ${DEFAULT_EMBEDDING_MODEL},
      ${EMBEDDING_PROMPT_VERSION},
      NOW()
    )
    ON CONFLICT ("video_id") DO UPDATE SET
      "embedding" = EXCLUDED."embedding",
      "model" = EXCLUDED."model",
      "prompt_version" = EXCLUDED."prompt_version",
      "generated_at" = EXCLUDED."generated_at"
  `;

  return { skipped: false };
}
