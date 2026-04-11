import { auth } from '@clerk/nextjs/server';
import { ArticleStyle } from '@readtube/database';
import { prisma } from '@readtube/database';
import { streamText } from 'ai';
import { NextRequest, NextResponse } from 'next/server';

interface TranscriptSegment {
  startMs: number;
  endMs: number;
  text: string;
}

const PROMPT_VERSION = 'v2';
const MODEL = 'google/gemini-2.5-flash';
const DEFAULT_STYLE: ArticleStyle = ArticleStyle.NARRATIVE;

function parseStyle(raw: string | null | undefined): ArticleStyle | null {
  if (raw == null) {
    return DEFAULT_STYLE;
  }
  if (Object.values(ArticleStyle).includes(raw as ArticleStyle)) {
    return raw as ArticleStyle;
  }
  return null;
}

function buildPrompt(style: ArticleStyle, title: string, channelName: string, transcript: string) {
  const styleGuidance =
    style === ArticleStyle.DIALOG
      ? `- Format the article as a dialog or interview transcript, preserving exchanges between speakers when the video is conversational.
- If there's only one speaker, format as a reflective monologue with paragraph breaks.`
      : `- Rewrite the transcript as a polished narrative article in GitHub Flavored Markdown.
- Use headings, subheadings, lists, and blockquotes where appropriate.`;

  return `You are an expert editor turning YouTube video transcripts into clean, well-formatted articles.

Instructions:
${styleGuidance}
- Remove filler words ("um", "uh", "like", "you know"), false starts, and verbal tics.
- Preserve the speaker's voice, key ideas, concrete details, and any numbers or examples.
- Do not invent facts that aren't in the transcript.
- Do not include the video title as a top-level heading — it will be shown separately.
- Start directly with the article content. No preamble like "Here is the article".
- Write in the same language as the transcript. Do not translate — if the transcript is in Chinese, write in Chinese; if Spanish, write in Spanish; and so on.

Video title: ${title}
Channel: ${channelName}

Transcript:
${transcript}`;
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (userId == null) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const styleParam = request.nextUrl.searchParams.get('style');
  const style = parseStyle(styleParam);
  if (!style) {
    return NextResponse.json({ error: 'Invalid style' }, { status: 400 });
  }

  // IDOR check + lookup latest transcript
  const video = await prisma.video.findFirst({
    where: { id, channel: { subscriptions: { some: { user_id: userId } } } },
    select: {
      id: true,
      transcripts: {
        orderBy: { created_at: 'desc' },
        take: 1,
        select: { id: true },
      },
    },
  });
  if (!video) {
    return NextResponse.json({ error: 'Video not found' }, { status: 404 });
  }

  const transcript = video.transcripts[0];
  if (!transcript) {
    return NextResponse.json({ error: 'Not cached' }, { status: 404 });
  }

  const article = await prisma.article.findUnique({
    where: {
      article_unique_transcript_style_version: {
        transcript_id: transcript.id,
        style,
        prompt_version: PROMPT_VERSION,
      },
    },
    select: { content: true, style: true, generated_at: true },
  });
  if (!article) {
    return NextResponse.json({ error: 'Not cached' }, { status: 404 });
  }

  return NextResponse.json({
    content: article.content,
    style: article.style,
    generatedAt: article.generated_at,
  });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (userId == null) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  let body: { style?: string } = {};
  try {
    body = (await request.json()) as { style?: string };
  } catch {
    // empty body is OK — use default style
  }
  const style = parseStyle(body.style);
  if (!style) {
    return NextResponse.json({ error: 'Invalid style' }, { status: 400 });
  }

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
        select: { id: true, text: true },
      },
    },
  });
  if (!video) {
    return NextResponse.json({ error: 'Video not found' }, { status: 404 });
  }

  const transcript = video.transcripts[0];
  if (!transcript) {
    return NextResponse.json(
      { error: 'Transcript not available. Fetch the transcript first.' },
      { status: 400 }
    );
  }

  // Cache hit: return the saved article as a single stream chunk so the client's
  // existing stream-reader code path works unchanged.
  const cached = await prisma.article.findUnique({
    where: {
      article_unique_transcript_style_version: {
        transcript_id: transcript.id,
        style,
        prompt_version: PROMPT_VERSION,
      },
    },
    select: { content: true },
  });

  const encoder = new TextEncoder();

  if (cached) {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(cached.content));
        controller.close();
      },
    });
    return new Response(stream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
      },
    });
  }

  const segments = JSON.parse(transcript.text) as TranscriptSegment[];
  const transcriptText = segments.map((s) => s.text).join(' ');

  const result = streamText({
    model: MODEL,
    prompt: buildPrompt(style, video.title, video.channel.name, transcriptText),
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

  const transcriptId = transcript.id;
  let fullText = '';
  let streamCompleted = false;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        if (!firstChunk.done && firstChunk.value) {
          fullText += firstChunk.value;
          controller.enqueue(encoder.encode(firstChunk.value));
        }
        while (true) {
          const next = await iterator.next();
          if (next.done) {
            break;
          }
          fullText += next.value;
          controller.enqueue(encoder.encode(next.value));
        }
        streamCompleted = true;
        controller.close();
      } catch (err) {
        console.error('[article/POST] streamText mid-stream error:', err);
        const message = err instanceof Error ? err.message : 'Unknown error';
        controller.enqueue(encoder.encode(`\n\n> **Error:** ${message}`));
        controller.close();
      }

      // Persist after the stream closes. Do not save partial articles.
      if (streamCompleted && fullText.trim().length > 0) {
        try {
          const usage = await result.usage;
          await prisma.article.create({
            data: {
              transcript_id: transcriptId,
              style,
              prompt_version: PROMPT_VERSION,
              model: MODEL,
              content: fullText,
              usage: usage ? JSON.parse(JSON.stringify(usage)) : null,
            },
          });
        } catch (err) {
          console.error('[article/POST] failed to persist article:', err);
        }
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
