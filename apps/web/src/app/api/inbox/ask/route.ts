import { prisma } from '@readtube/database';
import { embed, streamText } from 'ai';
import { NextRequest, NextResponse } from 'next/server';

import { EMBEDDING_MODEL } from '@/lib/ai/embed';
import { requireUserId } from '@/lib/auth';
import { headerSafeJson } from '@/lib/http/headerSafeJson';

interface RetrievedChunk {
  video_id: string;
  title: string;
  channel_name: string;
  summary: string | null;
  score: number;
}

/**
 * Ask-my-inbox. Retrieves the top-K semantically similar videos to the
 * question via pgvector cosine distance, then streams a Gemini answer
 * grounded on their summaries. The response is plain-text streamed over
 * HTTP; the client concatenates chunks.
 *
 * The citation list travels as an X-Citations header so the client can
 * render a sidebar of source videos without parsing the stream body.
 */
const K = 6;
const GENERATION_MODEL = 'google/gemini-2.5-flash';

export async function POST(request: NextRequest) {
  const authResult = await requireUserId();
  if (authResult instanceof NextResponse) {
    return authResult;
  }
  const userId = authResult;

  let body: { question?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }
  const question = body.question?.trim() ?? '';
  if (question.length === 0) {
    return NextResponse.json({ error: 'Missing question' }, { status: 400 });
  }

  // Embed the question through the same model used for video embeddings
  // so the vector space lines up.
  const { embedding } = await embed({
    model: EMBEDDING_MODEL,
    value: question,
  });
  const vectorLiteral = `[${embedding.join(',')}]`;

  // Cosine-distance retrieval via pgvector. The join to Subscription +
  // user_id keeps the retrieval scoped to the caller's inbox so users
  // can't ask questions against another user's history.
  interface RetrievalRow {
    video_id: string;
    title: string;
    channel_name: string;
    summary: string | null;
    distance: number;
  }

  // LATERAL subquery picks the LATEST Transcript per video (and its
  // Summary). The previous version LEFT-JOINed Transcript directly,
  // which produced one row per (video × transcript) combination —
  // a video with three transcripts would consume three of the
  // LIMIT 6 slots and show up duplicated in the citation list.
  const rows: RetrievalRow[] = await prisma.$queryRaw<RetrievalRow[]>`
    SELECT
      v."id"         AS video_id,
      v."title"      AS title,
      c."name"       AS channel_name,
      ts."short"     AS summary,
      (ve."embedding" <=> ${vectorLiteral}::vector) AS distance
    FROM "VideoEmbedding" ve
    JOIN "Video" v ON v."id" = ve."video_id"
    JOIN "Channel" c ON c."id" = v."channel_id"
    LEFT JOIN LATERAL (
      SELECT s."short"
      FROM "Transcript" t
      LEFT JOIN "Summary" s ON s."transcript_id" = t."id"
      WHERE t."video_id" = v."id"
      ORDER BY t."created_at" DESC
      LIMIT 1
    ) ts ON true
    WHERE v."channel_id" IN (
      SELECT "channel_id" FROM "UserSubscription" WHERE "user_id" = ${userId}
    )
    ORDER BY ve."embedding" <=> ${vectorLiteral}::vector ASC
    LIMIT ${K}
  `;

  if (rows.length === 0) {
    // Stream the friendly message back as plain text so the client's
    // streaming reader path renders it directly, instead of dumping
    // a JSON blob into the chat bubble. Mirrors the success path's
    // Content-Type and X-Citations header so the client doesn't
    // need a special branch.
    const message =
      "No embedded videos yet. Ingest a few videos first so there's something to search.";
    const noResultsStream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(message));
        controller.close();
      },
    });
    return new Response(noResultsStream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'X-Citations': '[]',
      },
    });
  }

  const chunks: RetrievedChunk[] = rows.map((row) => ({
    video_id: row.video_id,
    title: row.title,
    channel_name: row.channel_name,
    summary: row.summary,
    score: 1 - row.distance, // distance → similarity
  }));

  const context = chunks
    .map(
      (chunk, i) =>
        `[${i + 1}] Title: ${chunk.title}\n    Channel: ${chunk.channel_name}\n    Summary: ${chunk.summary ?? '(no summary)'}`
    )
    .join('\n\n');

  const prompt = `You are an assistant that answers questions about the user's personal YouTube reading list. Only use the context below. If the answer isn't in the context, say so plainly.

Context:
${context}

Question: ${question}

Answer with citations in the form [1], [2], etc. pointing to the numbered videos above. Keep it tight — no filler, no restating the question.`;

  const result = streamText({
    model: GENERATION_MODEL,
    prompt,
  });

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      for await (const chunk of result.textStream) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'X-Citations': headerSafeJson(
        chunks.map((c) => ({
          videoId: c.video_id,
          title: c.title,
          channelName: c.channel_name,
        }))
      ),
    },
  });
}
