import { auth } from '@clerk/nextjs/server';
import { ArticleStyle, Prisma, prisma } from '@readtube/database';
import { Output, streamText } from 'ai';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { DEFAULT_AI_MODEL } from '@/constants';
import { findOrCloneArticle } from '@/lib/language/cache';
import { buildLanguageRule } from '@/lib/language/prompt';
import { resolveTargetLanguage } from '@/lib/language/resolve';
import {
  CURRENT_FRONTMATTER_VERSION,
  parseMarkdownDocument,
  serializeMarkdownDocument,
} from '@/lib/markdownFrontmatter';
import { ensureTranscript } from '@/lib/transcripts/ensureTranscript';

const PROMPT_VERSION = 'v6';
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

function buildPrompt(
  style: ArticleStyle,
  target: string | null,
  title: string,
  channelName: string,
  transcript: string
) {
  const styleGuidance =
    style === ArticleStyle.DIALOG
      ? `- Format the article as a dialog or interview transcript, preserving exchanges between speakers when the video is conversational.
- If there's only one speaker, format as a reflective monologue with paragraph breaks.`
      : `- Reformat the transcript as an article in GitHub Flavored Markdown. This is a re-formatting task, not a rewriting or summarization task.`;

  return `${buildLanguageRule(target)}

You are an expert editor turning video transcripts into clean, well-formatted articles.

CRITICAL FIDELITY REQUIREMENT: Do NOT summarize, condense, abstract, paraphrase for brevity, or skip any substantive content. Every idea, argument, example, number, quote, and concrete detail in the transcript must appear in the article. The finished article should be roughly the same length as the transcript minus filler words — NOT shorter. If you find yourself compressing or omitting, stop and include the material.

Instructions:
${styleGuidance}
- Use whatever Markdown features best suit the content. You are not limited to headings, subheadings, lists, and blockquotes — also use tables (for comparisons / specs / enumerations), fenced code blocks (for code, commands, file paths, or configuration), inline code for short technical tokens, bold and italic emphasis, horizontal rules to separate unrelated sections, and links where the speaker references them. Pick the feature that best represents each chunk of content.
- Remove only filler words ("um", "uh", "like", "you know"), false starts, repeated words, and verbal tics. Do not remove substantive content.
- Preserve the speaker's voice, phrasing, and stylistic quirks. Keep concrete details, numbers, and examples verbatim.
- Do not invent facts, claims, or details that aren't in the transcript.
- Do not include the video title as a top-level heading — it will be shown separately.
- Start directly with the article content. No preamble like "Here is the article".

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
  const target = await resolveTargetLanguage(userId, request.nextUrl.searchParams.get('language'));

  console.info(
    `[article/GET] Fetching cached article for video ${id} (style=${style}, language=${target ?? 'original'}), user ${userId}`
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

  const article = await findOrCloneArticle(transcript.id, style, target);
  if (!article) {
    console.error(
      `[article/GET] No cached article for video ${id} (style=${style}, language=${target ?? 'original'})`
    );
    return NextResponse.json({ error: 'Not cached' }, { status: 404 });
  }

  return NextResponse.json({
    content: article.content,
    style: article.style,
    language: article.language,
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

  let body: { style?: string; force?: boolean } = {};
  try {
    body = (await request.json()) as { style?: string; force?: boolean };
  } catch {
    // empty body is OK — use default style
  }
  const style = parseStyle(body.style);
  const force = body.force === true;
  if (!style) {
    console.error(`[article/POST] Invalid style: ${body.style}`);
    return NextResponse.json({ error: 'Invalid style' }, { status: 400 });
  }
  const target = await resolveTargetLanguage(userId, request.nextUrl.searchParams.get('language'));

  console.info(
    `[article/POST] Generating article for video ${id} (style=${style}, language=${target ?? 'original'}), user ${userId}`
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
  // format. Skipped when `force` is set — the dev-only Regenerate
  // button wants a fresh LLM run. Use findOrCloneArticle so a
  // request for a target language whose Original happens to already
  // be in that language gets promoted (single UPDATE) instead of
  // regenerating.
  const cached = force ? null : await findOrCloneArticle(transcript.id, style, target);

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

  const result = streamText({
    model: DEFAULT_AI_MODEL,
    output: Output.object({ schema: ARTICLE_SCHEMA }),
    prompt: buildPrompt(style, target, video.title, video.channel.name, transcriptText),
  });

  // Eagerly consume the first partial so pre-flight errors (gateway
  // auth, invalid model, etc.) surface as a proper HTTP error before
  // the stream opens.
  const iterator = result.partialOutputStream[Symbol.asyncIterator]();
  let firstChunk: IteratorResult<Partial<z.infer<typeof ARTICLE_SCHEMA>>>;
  try {
    firstChunk = await iterator.next();
  } catch (err) {
    console.error('[article/POST] streamText output pre-flight error:', err);
    const message = err instanceof Error ? err.message : 'Failed to generate article.';
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const transcriptId = transcript.id;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let accumulated = '';
      let hasLatex: boolean | null = null;
      let emittedHasLatex = false;

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
            const settled = await result.output;
            hasLatex = settled.hasLatex;
            emittedHasLatex = true;
            emitLine(controller, { hasLatex });
          } catch {
            // Swallow — we already streamed the body.
          }
        }
        // Persist BEFORE emitting `done` + closing the stream, so a
        // client that drains until `done` can trust the row to be
        // committed by the time its follow-up SWR refetch runs. The
        // earlier order (close first, persist after) raced the
        // upsert against `invalidateLists()` and left the UI with a
        // stuck spinner when the refetch landed first.
        let persistError: string | null = null;
        if (accumulated.trim().length === 0) {
          // Stream said `done` but the LLM produced nothing — treat
          // as a failure so the row's pending flag resets. Without
          // this the client drains cleanly, returns true, and the
          // spinner stays pinned forever since `hasArticle` never
          // flips.
          persistError = 'Generation produced no content';
        } else {
          try {
            const usage = await result.usage;
            const contentForStorage = serializeMarkdownDocument(accumulated.trim(), {
              version: CURRENT_FRONTMATTER_VERSION,
              hasLatex: hasLatex === true,
            });

            // Manual upsert keyed on (transcript_id, style, language).
            // Prisma can't model the partial unique indexes that enforce
            // this, so we use findFirst + create, with a P2002 retry
            // for the rare race where another writer takes the same
            // slot between our find and create.
            const existing = await prisma.article.findFirst({
              where: { transcript_id: transcriptId, style, language: target },
              select: { id: true },
            });
            const articleData = {
              prompt_version: PROMPT_VERSION,
              model: DEFAULT_AI_MODEL,
              content: contentForStorage,
              usage: usage ? JSON.parse(JSON.stringify(usage)) : null,
            };
            if (existing) {
              await prisma.article.update({
                where: { id: existing.id },
                data: { ...articleData, generated_at: new Date() },
              });
            } else {
              try {
                await prisma.article.create({
                  data: {
                    transcript_id: transcriptId,
                    style,
                    language: target,
                    ...articleData,
                  },
                });
              } catch (err) {
                if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
                  const raced = await prisma.article.findFirst({
                    where: { transcript_id: transcriptId, style, language: target },
                    select: { id: true },
                  });
                  if (raced) {
                    await prisma.article.update({
                      where: { id: raced.id },
                      data: { ...articleData, generated_at: new Date() },
                    });
                  } else {
                    throw err;
                  }
                } else {
                  throw err;
                }
              }
            }
          } catch (err) {
            console.error('[article/POST] failed to persist article:', err);
            persistError = err instanceof Error ? err.message : 'Failed to save article';
          }
        }

        // See the summary route for the rationale — emitting `error`
        // instead of `done` on persist failure lets the client's
        // stream drain throw and reset the row's pending flag.
        if (persistError != null) {
          emitLine(controller, { error: persistError });
        } else {
          emitLine(controller, { type: 'done' });
        }
        controller.close();
      } catch (err) {
        console.error('[article/POST] streamText output mid-stream error:', err);
        const message = err instanceof Error ? err.message : 'Unknown error';
        emitLine(controller, { error: message });
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: ndjsonHeaders });
}
