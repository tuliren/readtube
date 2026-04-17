import { auth } from '@clerk/nextjs/server';
import { ArticleStyle, prisma } from '@readtube/database';
import { streamObject } from 'ai';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { DEFAULT_AI_MODEL } from '@/constants';
import {
  CURRENT_FRONTMATTER_VERSION,
  parseMarkdownDocument,
  serializeMarkdownDocument,
} from '@/lib/markdownFrontmatter';
import { ensureTranscript } from '@/lib/transcripts/ensureTranscript';

const PROMPT_VERSION = 'v4';
const DEFAULT_STYLE: ArticleStyle = ArticleStyle.NARRATIVE;

// Structured-output schema: content first (so the model writes the
// body before deciding hasLatex), hasLatex second (so the flag
// reflects what the model actually produced).
const ARTICLE_SCHEMA = z.object({
  content: z
    .string()
    .describe('The markdown body of the article. Do not include any YAML frontmatter.'),
  hasLatex: z
    .boolean()
    .describe(
      'True if the content field above contains at least one LaTeX math formula wrapped in single or double dollar signs (e.g. $E = mc^2$ or $$\\int_0^1 x\\,dx$$). False otherwise. Dollar amounts like "$5 million" are not math and must not set this flag to true.'
    ),
});

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
    console.error('[article/GET] Unauthorized');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const styleParam = request.nextUrl.searchParams.get('style');
  const style = parseStyle(styleParam);
  if (!style) {
    console.error(`[article/GET] Invalid style: ${styleParam}`);
    return NextResponse.json({ error: 'Invalid style' }, { status: 400 });
  }

  console.info(
    `[article/GET] Fetching cached article for video ${id} (style=${style}), user ${userId}`
  );

  // IDOR check + lookup latest transcript
  const video = await prisma.video.findFirst({
    where: {
      id,
      OR: [
        { channel: { subscriptions: { some: { user_id: userId } } } },
        { standalone: { some: { user_id: userId } } },
        { playlist_items: { some: { playlist: { user_id: userId } } } },
      ],
    },
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
    console.error(`[article/GET] Video ${id} not accessible by user ${userId}`);
    return NextResponse.json({ error: 'Video not found' }, { status: 404 });
  }

  const transcript = video.transcripts[0];
  if (!transcript) {
    console.error(`[article/GET] No transcript cached for video ${id}`);
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
    console.error(`[article/GET] No cached article for video ${id} (style=${style})`);
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
    console.error('[article/POST] Unauthorized');
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
    console.error(`[article/POST] Invalid style: ${body.style}`);
    return NextResponse.json({ error: 'Invalid style' }, { status: 400 });
  }

  console.info(
    `[article/POST] Generating article for video ${id} (style=${style}), user ${userId}`
  );

  // Look up title + channel name first; ensureTranscript will do
  // its own IDOR check + transcript resolution.
  const video = await prisma.video.findFirst({
    where: {
      id,
      OR: [
        { channel: { subscriptions: { some: { user_id: userId } } } },
        { standalone: { some: { user_id: userId } } },
        { playlist_items: { some: { playlist: { user_id: userId } } } },
      ],
    },
    select: {
      id: true,
      title: true,
      channel: { select: { name: true } },
    },
  });
  if (!video) {
    console.error(`[article/POST] Video ${id} not accessible by user ${userId}`);
    return NextResponse.json({ error: 'Video not found' }, { status: 404 });
  }

  // Auto-fetch the transcript on the user's first Generate click.
  // ensureTranscript caches success and the sticky unavailable flag
  // — same shared helper the summary route uses, so both Generate
  // paths behave identically (single click → wait → result, with
  // no retry for confirmed-unavailable videos).
  const ensured = await ensureTranscript(prisma, userId, id);
  if (!ensured.ok) {
    if (ensured.reason === 'not-found') {
      console.error(`[article/POST] Video ${id} not found during ensureTranscript`);
      return NextResponse.json({ error: 'Video not found' }, { status: 404 });
    }
    if (ensured.reason === 'transient-error') {
      console.error(`[article/POST] Transient transcript fetch error for video ${id}`);
      return NextResponse.json(
        {
          error: 'Could not fetch the transcript right now — please try again.',
          code: 'transient',
        },
        { status: 503 }
      );
    }
    console.error(`[article/POST] Transcript unavailable for video ${id}`);
    return NextResponse.json(
      { error: 'Transcript unavailable for this video.', code: 'unavailable' },
      { status: 410 }
    );
  }
  const transcript = ensured.transcript;

  const encoder = new TextEncoder();
  const emitLine = (controller: ReadableStreamDefaultController<Uint8Array>, event: object) => {
    controller.enqueue(encoder.encode(JSON.stringify(event) + '\n'));
  };
  const ndjsonHeaders = {
    'Content-Type': 'application/x-ndjson; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
  } as const;

  // Cache hit: replay the stored article as a single-event NDJSON
  // stream so the client's POST handler only has to know one wire
  // format.
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

  if (cached) {
    const parsed = parseMarkdownDocument(cached.content);
    const hasLatex = parsed.properties.hasLatex === true;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        emitLine(controller, { delta: parsed.content });
        emitLine(controller, { hasLatex });
        emitLine(controller, { type: 'done' });
        controller.close();
      },
    });
    return new Response(stream, { headers: ndjsonHeaders });
  }

  const transcriptText = transcript.segments.map((s) => s.text).join(' ');

  const result = streamObject({
    model: DEFAULT_AI_MODEL,
    schema: ARTICLE_SCHEMA,
    prompt: buildPrompt(style, video.title, video.channel.name, transcriptText),
  });

  // Eagerly consume the first partial so pre-flight errors (gateway
  // auth, invalid model, etc.) surface as a proper HTTP error before
  // the stream opens.
  const iterator = result.partialObjectStream[Symbol.asyncIterator]();
  let firstChunk: IteratorResult<Partial<z.infer<typeof ARTICLE_SCHEMA>>>;
  try {
    firstChunk = await iterator.next();
  } catch (err) {
    console.error('[article/POST] streamObject pre-flight error:', err);
    const message = err instanceof Error ? err.message : 'Failed to generate article.';
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const transcriptId = transcript.id;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let accumulated = '';
      let hasLatex: boolean | null = null;
      let emittedHasLatex = false;
      let streamCompleted = false;

      const applyPartial = (partial: Partial<z.infer<typeof ARTICLE_SCHEMA>> | undefined) => {
        if (partial == null) {
          return;
        }
        if (typeof partial.content === 'string' && partial.content.length > accumulated.length) {
          const delta = partial.content.slice(accumulated.length);
          accumulated = partial.content;
          emitLine(controller, { delta });
        }
        if (!emittedHasLatex && typeof partial.hasLatex === 'boolean') {
          emittedHasLatex = true;
          hasLatex = partial.hasLatex;
          emitLine(controller, { hasLatex });
        }
      };

      try {
        if (!firstChunk.done) {
          applyPartial(firstChunk.value);
        }
        while (true) {
          const next = await iterator.next();
          if (next.done) {
            break;
          }
          applyPartial(next.value);
        }
        if (!emittedHasLatex) {
          try {
            const settled = await result.object;
            hasLatex = settled.hasLatex;
            emittedHasLatex = true;
            emitLine(controller, { hasLatex });
          } catch {
            // Swallow — we already streamed the body.
          }
        }
        streamCompleted = true;
        emitLine(controller, { type: 'done' });
        controller.close();
      } catch (err) {
        console.error('[article/POST] streamObject mid-stream error:', err);
        const message = err instanceof Error ? err.message : 'Unknown error';
        emitLine(controller, { error: message });
        controller.close();
      }

      // Persist after the stream closes. Do not save partial articles.
      if (streamCompleted && accumulated.trim().length > 0) {
        try {
          const usage = await result.usage;
          const contentForStorage = serializeMarkdownDocument(accumulated.trim(), {
            version: CURRENT_FRONTMATTER_VERSION,
            hasLatex: hasLatex === true,
          });
          await prisma.article.create({
            data: {
              transcript_id: transcriptId,
              style,
              prompt_version: PROMPT_VERSION,
              model: DEFAULT_AI_MODEL,
              content: contentForStorage,
              usage: usage ? JSON.parse(JSON.stringify(usage)) : null,
            },
          });
        } catch (err) {
          console.error('[article/POST] failed to persist article:', err);
        }
      }
    },
  });

  return new Response(stream, { headers: ndjsonHeaders });
}
