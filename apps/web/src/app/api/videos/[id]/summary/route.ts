import { auth } from '@clerk/nextjs/server';
import { streamText } from 'ai';
import { NextRequest, NextResponse } from 'next/server';

import { prisma } from '@/lib/db';

interface TranscriptSegment {
  startMs: number;
  endMs: number;
  text: string;
}

const SUMMARY_PROMPT_VERSION = 'v3';
const MODEL = 'google/gemini-2.5-flash';

const LANGUAGE_RULE = `Write in the same language as the transcript below. Do not translate — if the transcript is in Chinese, write in Chinese; if Spanish, write in Spanish; and so on.`;

const PROMPTS = {
  headline: `Write a very short title for this video. Rules:
- Title style, not a sentence — think newspaper headline.
- Under 10 words. Shorter is better.
- No markdown, no surrounding quotes, no prefix like "Title:".
- ${LANGUAGE_RULE}
Output only the title itself, nothing else.`,
  short: `Write a 2-3 sentence summary of this video. Rules:
- First sentence: the essential point.
- 1-2 more sentences: the most important supporting context.
- Plain prose. No headings, no lists, no preamble.
- ${LANGUAGE_RULE}`,
  full: `Write a compact summary of this video — at most 2-3 short paragraphs (not more). Rules:
- Focus only on the main arguments and conclusions. Cut examples, tangents, and non-essential details.
- Favor density over completeness. A reader should get the gist in under a minute.
- No headings or lists — just prose.
- ${LANGUAGE_RULE}`,
} as const;

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
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  const video = await prisma.video.findFirst({
    where: { id, channel: { subscriptions: { some: { user_id: userId } } } },
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
    return NextResponse.json({ error: 'Video not found' }, { status: 404 });
  }

  const transcript = video.transcripts[0];
  if (!transcript?.summary) {
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
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  // Optional body: { fields?: SummaryField[] } — defaults to all three.
  let requestedFields: SummaryField[] | null = null;
  try {
    const body = (await request.json()) as { fields?: unknown };
    if (Array.isArray(body.fields)) {
      const valid = body.fields.filter((f): f is SummaryField =>
        SUMMARY_FIELDS.includes(f as SummaryField)
      );
      if (valid.length === 0) {
        return NextResponse.json({ error: 'No valid fields to generate' }, { status: 400 });
      }
      requestedFields = valid;
    }
  } catch {
    // Empty body — fall through to generating all fields
  }
  const fieldsToGenerate: SummaryField[] = requestedFields ?? [...SUMMARY_FIELDS];

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

  const segments = JSON.parse(transcript.text) as TranscriptSegment[];
  const transcriptText = segments.map((s) => s.text).join(' ');

  // Kick off streams for the requested fields in parallel.
  const generations = fieldsToGenerate.map((field) => {
    const result = streamText({
      model: MODEL,
      prompt: buildPrompt(field, video.title, video.channel.name, transcriptText),
    });
    return { field, result, iterator: result.textStream[Symbol.asyncIterator]() };
  });

  // Pre-flight: await the first chunk of each stream so auth/gateway errors
  // surface as a proper HTTP error before the stream starts.
  let firstChunks: IteratorResult<string>[];
  try {
    firstChunks = await Promise.all(generations.map((g) => g.iterator.next()));
  } catch (err) {
    console.error('[summary/POST] streamText pre-flight error:', err);
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
      const fieldErrors: Partial<Record<SummaryField, string>> = {};

      function emit(event: object) {
        controller.enqueue(encoder.encode(JSON.stringify(event) + '\n'));
      }

      // Pump each source stream into the output, interleaved.
      const pumps = generations.map(async ({ field, iterator }, idx) => {
        const first = firstChunks[idx];
        try {
          if (!first.done && first.value) {
            accumulated[field] += first.value;
            emit({ field, delta: first.value });
          }
          while (true) {
            const next = await iterator.next();
            if (next.done) {
              break;
            }
            accumulated[field] += next.value;
            emit({ field, delta: next.value });
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

          const summaryData = {
            headline: fieldsToGenerate.includes('headline')
              ? accumulated.headline.trim()
              : (existing?.headline ?? null),
            short: fieldsToGenerate.includes('short')
              ? accumulated.short.trim()
              : (existing?.short ?? null),
            full: fieldsToGenerate.includes('full')
              ? accumulated.full.trim()
              : (existing?.full ?? null),
            prompt_version: SUMMARY_PROMPT_VERSION,
            model: MODEL,
            usage: mergedUsage,
          };

          await prisma.summary.upsert({
            where: { transcript_id: transcriptId },
            create: { transcript_id: transcriptId, ...summaryData },
            update: summaryData,
          });
        } catch (err) {
          console.error('[summary/POST] failed to persist summary:', err);
        }
      }

      emit({ type: 'done' });
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
