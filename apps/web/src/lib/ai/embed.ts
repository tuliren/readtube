import { prisma } from '@readtube/database';
import { embed } from 'ai';
import { randomUUID } from 'node:crypto';

/**
 * Version stamp for the embedding input recipe. Bump whenever the text we
 * feed the embedder changes — the cron will re-embed any video whose stored
 * version is stale. Keeping this as a string (not an env var) means a simple
 * code change forces regeneration without a separate deploy step.
 */
export const EMBEDDING_PROMPT_VERSION = 'v1';

/**
 * Model for semantic embeddings. 1536 native dims matches the pgvector
 * column in the schema. We use OpenAI for embeddings even though
 * generation (summaries, articles, Ask-my-inbox answers) uses Google
 * Gemini — the Vercel AI Gateway routes them independently by provider
 * prefix, and no 1536-dim Google embedding model is available through
 * the gateway as a plain string identifier today. If you swap to a
 * model with a different output size, bump EMBEDDING_PROMPT_VERSION
 * AND alter the pgvector column + HNSW index together.
 */
export const EMBEDDING_MODEL = 'openai/text-embedding-3-small';

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
          summary: { select: { full: true, short: true, headline: true } },
        },
        orderBy: { created_at: 'desc' },
        take: 1,
      },
    },
  });
  if (video == null) {
    return { skipped: true, reason: 'video-missing' };
  }

  const summary = video.transcripts[0]?.summary;
  const summaryText = summary?.full ?? summary?.short ?? summary?.headline ?? '';
  const input = [
    `Title: ${video.title}`,
    `Channel: ${video.channel.name}`,
    summaryText.length > 0 ? `Summary: ${summaryText}` : null,
  ]
    .filter((line) => line != null)
    .join('\n');

  const { embedding } = await embed({
    model: EMBEDDING_MODEL,
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
      ${EMBEDDING_MODEL},
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
