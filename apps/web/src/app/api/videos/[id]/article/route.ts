import { auth } from '@clerk/nextjs/server';
import { streamText } from 'ai';
import { NextRequest, NextResponse } from 'next/server';

import { prisma } from '@/lib/db';

interface TranscriptSegment {
  startMs: number;
  endMs: number;
  text: string;
}

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  // IDOR check + fetch most recent cached transcript
  const video = await prisma.video.findFirst({
    where: { id, channel: { subscriptions: { some: { user_id: userId } } } },
    select: {
      id: true,
      title: true,
      channel: { select: { name: true } },
      transcripts: {
        orderBy: { created_at: 'desc' },
        take: 1,
        select: { text: true },
      },
    },
  });
  if (!video) {
    return NextResponse.json({ error: 'Video not found' }, { status: 404 });
  }

  const cached = video.transcripts[0];
  if (!cached) {
    return NextResponse.json(
      { error: 'Transcript not available. Fetch the transcript first.' },
      { status: 400 }
    );
  }

  const segments = JSON.parse(cached.text) as TranscriptSegment[];
  const transcriptText = segments.map((s) => s.text).join(' ');

  const result = streamText({
    model: 'anthropic/claude-sonnet-4.5',
    prompt: `You are an expert editor turning YouTube video transcripts into clean, well-formatted articles.

Instructions:
- Rewrite the transcript below into a polished article in GitHub Flavored Markdown.
- Use headings, subheadings, lists, and blockquotes where appropriate.
- Remove filler words ("um", "uh", "like", "you know"), false starts, and verbal tics.
- Preserve the speaker's voice, key ideas, concrete details, and any numbers or examples.
- Do not invent facts that aren't in the transcript.
- Do not include the video title as a top-level heading — it will be shown separately.
- Start directly with the article content. No preamble like "Here is the article".

Video title: ${video.title}
Channel: ${video.channel.name}

Transcript:
${transcriptText}`,
  });

  // Eagerly consume the first chunk so pre-flight errors (gateway auth,
  // invalid model, etc.) surface as a proper HTTP error before streaming starts.
  const iterator = result.textStream[Symbol.asyncIterator]();
  let firstChunk: IteratorResult<string>;
  try {
    firstChunk = await iterator.next();
  } catch (err) {
    console.error('[article/POST] streamText pre-flight error:', err);
    const message = err instanceof Error ? err.message : 'Failed to generate article.';
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        if (!firstChunk.done && firstChunk.value) {
          controller.enqueue(encoder.encode(firstChunk.value));
        }
        while (true) {
          const next = await iterator.next();
          if (next.done) {
            break;
          }
          controller.enqueue(encoder.encode(next.value));
        }
        controller.close();
      } catch (err) {
        console.error('[article/POST] streamText mid-stream error:', err);
        const message = err instanceof Error ? err.message : 'Unknown error';
        controller.enqueue(encoder.encode(`\n\n> **Error:** ${message}`));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
    },
  });
}
