import { auth } from '@clerk/nextjs/server';
import { prisma } from '@readtube/database';
import { Output, streamText } from 'ai';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { DEFAULT_AI_MODEL } from '@/constants';
import { CURRENT_FRONTMATTER_VERSION, serializeMarkdownDocument } from '@/lib/markdownFrontmatter';
import { ensureTranscript } from '@/lib/transcripts/ensureTranscript';

const SUMMARY_PROMPT_VERSION = 'v7';

// Leading-position language rule. Prior wording lived at the end of
// each prompt and the model — especially on the longer full-summary
// prompt — would revert to English for Chinese transcripts. Putting
// the instruction first and phrasing it as a hard constraint (rather
// than a bullet among many) fixes that.
const LANGUAGE_RULE = `CRITICAL LANGUAGE REQUIREMENT: Every word of your output — every sentence, every bullet, every title — MUST be written in the exact same natural language as the transcript below. Detect the transcript's language from its content and write in THAT language. Do not translate. Do not mix languages. If the transcript is in Chinese, write entirely in Chinese. If Japanese, entirely in Japanese. If Spanish, entirely in Spanish. Apply this rule before anything else below.`;

const PROMPTS = {
  headline: `${LANGUAGE_RULE}

Write a very short title for this video. Rules:
- Title style, not a sentence — think newspaper headline.
- Under 10 words. Shorter is better.
- No markdown, no surrounding quotes, no prefix like "Title:".
Output only the title itself, nothing else.`,
  short: `${LANGUAGE_RULE}

Write a 2-3 sentence summary of this video. Rules:
- First sentence: the essential point.
- 1-2 more sentences: the most important supporting context.
- Plain prose. No headings, no lists, no preamble.`,
  full: `${LANGUAGE_RULE}

Write a compact summary of this video. Rules:
- Focus only on the main arguments and conclusions. Cut examples, tangents, and non-essential details.
- Favor density over completeness. A reader should get the gist in under a minute.
- Choose the format that fits the content best:
  - Use prose (2-3 short paragraphs) when the video is one continuous argument.
  - Use a Markdown bullet list when the video naturally breaks into discrete items (steps, tips, comparisons, list-of-N).
  - Mix prose and a short bullet list when an introductory point is followed by enumerated takeaways.
- Bullets must be terse (one line each) and use Markdown "- " syntax. Do not nest more than one level.
- Never use headings (no #, ##, etc.). Do not bold or italicize.`,
} as const;

// Structured-output schema for short/full. Keep `content` before
// `hasLatex` so the model commits to the body text first, then
// classifies what it wrote. Asking for hasLatex up front produces
// garbage (the model defaults to false because it's guessing before
// writing).
const CONTENT_WITH_LATEX_SCHEMA = z.object({
  content: z
    .string()
    .describe('The markdown body of the summary. Do not include any YAML frontmatter.'),
  hasLatex: z
    .boolean()
    .describe(
      'True if the content field above contains at least one LaTeX math formula wrapped in single or double dollar signs (e.g. $E = mc^2$ or $$\\int_0^1 x\\,dx$$). False otherwise. Dollar amounts like "$5 million" are not math and must not set this flag to true.'
    ),
});

const FIELDS_WITH_FRONTMATTER: ReadonlySet<SummaryField> = new Set<SummaryField>(['short', 'full']);

type SummaryField = keyof typeof PROMPTS;
const SUMMARY_FIELDS: readonly SummaryField[] = ['headline', 'short', 'full'] as const;

function buildPrompt(kind: SummaryField, title: string, channelName: string, transcript: string) {
  return `${PROMPTS[kind]}

Video title: ${title}
Channel: ${channelName}

Transcript:
${transcript}`;
}

function serializeUsage(usage: unknown) {
  if (usage == null) {
    return null;
  }
  return JSON.parse(JSON.stringify(usage));
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (userId == null) {
    console.error('[summary/GET] Unauthorized');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  console.info(`[summary/GET] Fetching cached summary for video ${id}, user ${userId}`);

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
        select: {
          id: true,
          summary: {
            select: {
              headline: true,
              short: true,
              full: true,
              generated_at: true,
            },
          },
        },
      },
    },
  });
  if (!video) {
    console.error(`[summary/GET] Video ${id} not accessible by user ${userId}`);
    return NextResponse.json({ error: 'Video not found' }, { status: 404 });
  }

  const transcript = video.transcripts[0];
  if (!transcript?.summary) {
    console.error(`[summary/GET] No cached summary for video ${id}`);
    return NextResponse.json({ error: 'Not cached' }, { status: 404 });
  }

  return NextResponse.json({
    headline: transcript.summary.headline,
    short: transcript.summary.short,
    full: transcript.summary.full,
    generatedAt: transcript.summary.generated_at,
  });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (userId == null) {
    console.error('[summary/POST] Unauthorized');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  console.info(`[summary/POST] Generating summary for video ${id}, user ${userId}`);

  // Optional body: { fields?: SummaryField[] } — defaults to all three.
  let requestedFields: SummaryField[] | null = null;
  try {
    const body = (await request.json()) as { fields?: unknown };
    if (Array.isArray(body.fields)) {
      const valid = body.fields.filter((f): f is SummaryField =>
        SUMMARY_FIELDS.includes(f as SummaryField)
      );
      if (valid.length === 0) {
        console.error('[summary/POST] No valid fields to generate');
        return NextResponse.json({ error: 'No valid fields to generate' }, { status: 400 });
      }
      requestedFields = valid;
    }
  } catch {
    // Empty body — fall through to generating all fields
  }
  const fieldsToGenerate: SummaryField[] = requestedFields ?? [...SUMMARY_FIELDS];

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
    console.error(`[summary/POST] Video ${id} not accessible by user ${userId}`);
    return NextResponse.json({ error: 'Video not found' }, { status: 404 });
  }

  // Auto-fetch the transcript if it isn't already cached. The single
  // ensureTranscript call replaces "expect transcript or 400" — the
  // user clicks Generate once and the route transparently ensures
  // there's something to feed the model. If the upstream provider
  // can't deliver captions, ensureTranscript flips the sticky
  // transcript_unavailable flag on the Video so we don't waste a
  // round-trip on the next click.
  const ensured = await ensureTranscript(prisma, userId, id);
  if (!ensured.ok) {
    if (ensured.reason === 'not-found') {
      console.error(`[summary/POST] Video ${id} not found during ensureTranscript`);
      return NextResponse.json({ error: 'Video not found' }, { status: 404 });
    }
    if (ensured.reason === 'transient-error') {
      console.error(`[summary/POST] Transient transcript fetch error for video ${id}`);
      return NextResponse.json(
        {
          error: 'Could not fetch the transcript right now — please try again.',
          code: 'transient',
        },
        { status: 503 }
      );
    }
    console.error(`[summary/POST] Transcript unavailable for video ${id}`);
    return NextResponse.json(
      { error: 'Transcript unavailable for this video.', code: 'unavailable' },
      { status: 410 }
    );
  }
  const transcript = ensured.transcript;
  const transcriptText = transcript.segments.map((s) => s.text).join(' ');

  // Kick off streams for the requested fields in parallel. Headline
  // uses plain streamText — it's a one-line title, never math. Short
  // and full use streamText with Output.object({schema}) so the model
  // emits {content, hasLatex} as a single structured response;
  // hasLatex lands after content is written, so the classification
  // reflects what the model actually produced rather than a forward
  // guess.
  //
  // The full StreamTextResult<TOOLS, OUTPUT> type is painful to name
  // inline, so these interfaces capture only the surface area the
  // pump logic actually uses. Inference at the call sites keeps the
  // concrete result types precise.
  type StructuredOutput = z.infer<typeof CONTENT_WITH_LATEX_SCHEMA>;
  type UsageProducer = { usage: PromiseLike<unknown> };
  interface TextGen {
    kind: 'text';
    field: SummaryField;
    result: UsageProducer;
    iterator: AsyncIterator<string>;
  }
  interface ObjectGen {
    kind: 'object';
    field: SummaryField;
    result: UsageProducer & { output: PromiseLike<StructuredOutput> };
    iterator: AsyncIterator<Partial<StructuredOutput>>;
  }
  type Generation = TextGen | ObjectGen;

  const generations: Generation[] = fieldsToGenerate.map((field): Generation => {
    const prompt = buildPrompt(field, video.title, video.channel.name, transcriptText);
    if (FIELDS_WITH_FRONTMATTER.has(field)) {
      const result = streamText({
        model: DEFAULT_AI_MODEL,
        output: Output.object({ schema: CONTENT_WITH_LATEX_SCHEMA }),
        prompt,
      });
      return {
        kind: 'object',
        field,
        result,
        iterator: result.partialOutputStream[Symbol.asyncIterator](),
      };
    }
    const result = streamText({ model: DEFAULT_AI_MODEL, prompt });
    return {
      kind: 'text',
      field,
      result,
      iterator: result.textStream[Symbol.asyncIterator](),
    };
  });

  // Pre-flight: await the first chunk of each stream so auth/gateway errors
  // surface as a proper HTTP error before the stream starts.
  type FirstChunk =
    | { kind: 'text'; value: IteratorResult<string> }
    | {
        kind: 'object';
        value: IteratorResult<Partial<z.infer<typeof CONTENT_WITH_LATEX_SCHEMA>>>;
      };
  let firstChunks: FirstChunk[];
  try {
    firstChunks = await Promise.all(
      generations.map(async (g) => {
        if (g.kind === 'text') {
          return { kind: 'text' as const, value: await g.iterator.next() };
        }
        return { kind: 'object' as const, value: await g.iterator.next() };
      })
    );
  } catch (err) {
    console.error('[summary/POST] stream pre-flight error:', err);
    const message = err instanceof Error ? err.message : 'Failed to generate summary.';
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const transcriptId = transcript.id;
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const accumulated: Record<SummaryField, string> = {
        headline: '',
        short: '',
        full: '',
      };
      const hasLatexByField: Partial<Record<SummaryField, boolean>> = {};
      const fieldErrors: Partial<Record<SummaryField, string>> = {};

      function emit(event: object) {
        controller.enqueue(encoder.encode(JSON.stringify(event) + '\n'));
      }

      // Pump each source stream into the output, interleaved. For
      // object streams we compute a delta relative to the previous
      // content length, so the wire format stays chunk-based like
      // the text path.
      const pumps = generations.map(async (gen, idx) => {
        const { field } = gen;
        const first = firstChunks[idx];
        try {
          if (gen.kind === 'text' && first.kind === 'text') {
            if (!first.value.done && first.value.value) {
              accumulated[field] += first.value.value;
              emit({ field, delta: first.value.value });
            }
            while (true) {
              const next = await gen.iterator.next();
              if (next.done) {
                break;
              }
              accumulated[field] += next.value;
              emit({ field, delta: next.value });
            }
            return;
          }
          if (gen.kind === 'object' && first.kind === 'object') {
            let emittedHasLatex = false;
            const applyPartial = (
              partial: Partial<z.infer<typeof CONTENT_WITH_LATEX_SCHEMA>> | undefined
            ) => {
              if (partial == null) {
                return;
              }
              if (
                typeof partial.content === 'string' &&
                partial.content.length > accumulated[field].length
              ) {
                const delta = partial.content.slice(accumulated[field].length);
                accumulated[field] = partial.content;
                emit({ field, delta });
              }
              if (!emittedHasLatex && typeof partial.hasLatex === 'boolean') {
                emittedHasLatex = true;
                hasLatexByField[field] = partial.hasLatex;
                emit({ field, hasLatex: partial.hasLatex });
              }
            };
            if (!first.value.done) {
              applyPartial(first.value.value);
            }
            while (true) {
              const next = await gen.iterator.next();
              if (next.done) {
                break;
              }
              applyPartial(next.value);
            }
            // Fallback: if the stream finished without a hasLatex flip
            // (shouldn't happen — schema requires it — but be safe),
            // resolve from the settled object and emit once.
            if (!emittedHasLatex) {
              try {
                const settled = await gen.result.output;
                hasLatexByField[field] = settled.hasLatex;
                emit({ field, hasLatex: settled.hasLatex });
              } catch {
                // Swallow — we already streamed the content.
              }
            }
          }
        } catch (err) {
          console.error(`[summary/POST] ${field} stream error:`, err);
          const message = err instanceof Error ? err.message : 'Unknown error';
          fieldErrors[field] = message;
          emit({ field, error: message });
        }
      });

      await Promise.all(pumps);

      // Only persist if all requested fields completed successfully.
      const allSuccessful =
        Object.keys(fieldErrors).length === 0 &&
        fieldsToGenerate.every((f) => accumulated[f].trim().length > 0);

      let persistError: string | null = null;
      // When the LLM streams cleanly but produces empty content (or a
      // field errored so we skipped persist), there's nothing for the
      // next SWR refetch to pick up. Per-field stream errors already
      // emit `{ field, error }` inside the pump; the remaining gap is
      // the "stream said done, nothing written" case — surface that
      // as a terminal error so the client's spinner can reset.
      if (!allSuccessful && Object.keys(fieldErrors).length === 0) {
        persistError = 'Generation produced no content';
      }
      if (allSuccessful) {
        try {
          const usages = await Promise.all(generations.map((g) => g.result.usage));

          // Merge with any existing row so non-regenerated fields stay intact.
          const existing = await prisma.summary.findUnique({
            where: { transcript_id: transcriptId },
            select: { headline: true, short: true, full: true, usage: true },
          });

          const mergedUsageObj: Record<string, unknown> = {
            ...((existing?.usage as Record<string, unknown> | null) ?? {}),
          };
          for (let i = 0; i < generations.length; i++) {
            mergedUsageObj[generations[i].field] = serializeUsage(usages[i]);
          }
          // Round-trip through JSON so Prisma's InputJsonValue type is happy.
          const mergedUsage = JSON.parse(JSON.stringify(mergedUsageObj));

          const wrapForStorage = (field: SummaryField): string => {
            const body = accumulated[field].trim();
            if (!FIELDS_WITH_FRONTMATTER.has(field)) {
              return body;
            }
            return serializeMarkdownDocument(body, {
              version: CURRENT_FRONTMATTER_VERSION,
              hasLatex: hasLatexByField[field] === true,
            });
          };

          const summaryData = {
            headline: fieldsToGenerate.includes('headline')
              ? wrapForStorage('headline')
              : (existing?.headline ?? null),
            short: fieldsToGenerate.includes('short')
              ? wrapForStorage('short')
              : (existing?.short ?? null),
            full: fieldsToGenerate.includes('full')
              ? wrapForStorage('full')
              : (existing?.full ?? null),
            prompt_version: SUMMARY_PROMPT_VERSION,
            model: DEFAULT_AI_MODEL,
            usage: mergedUsage,
          };

          await prisma.summary.upsert({
            where: { transcript_id: transcriptId },
            create: { transcript_id: transcriptId, ...summaryData },
            update: summaryData,
          });
        } catch (err) {
          console.error('[summary/POST] failed to persist summary:', err);
          persistError = err instanceof Error ? err.message : 'Failed to save summary';
        }
      }

      // Emit a terminal error instead of `done` when persist fails so
      // the client's stream drain throws, the row's pending flag
      // clears, and the user sees a toast + can retry. Silently
      // logging and still emitting `done` left the UI spinner stuck.
      if (persistError != null) {
        emit({ error: persistError });
      } else {
        emit({ type: 'done' });
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
    },
  });
}
