import { auth } from '@clerk/nextjs/server';
import { generateText } from 'ai';
import { NextRequest, NextResponse } from 'next/server';

import { prisma } from '@/lib/db';

interface TranscriptSegment {
  startMs: number;
  endMs: number;
  text: string;
}

const SUMMARY_PROMPT_VERSION = 'v1';
const MODEL = 'anthropic/claude-sonnet-4.5';

const PROMPTS = {
  headline: `Write a single-sentence title that captures this video. Include the most important fact, number, or claim if there is one. No markdown, no surrounding quotes, no prefix like "Title:". Just the sentence itself.`,
  short: `Write a one-paragraph summary of this video that a reader can skim in 10-20 seconds. Cover the main points without headings or lists — just prose. No preamble.`,
  full: `Write a condensed re-write of this video as several paragraphs. Preserve the logic flow, main arguments, and key supporting details. No headings or lists — just prose that lets someone understand the video without watching it. Length should scale with the source: longer for dense videos, shorter for simple ones.`,
} as const;

type SummaryKind = keyof typeof PROMPTS;

function buildPrompt(kind: SummaryKind, title: string, channelName: string, transcript: string) {
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

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

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

  let results;
  try {
    results = await Promise.all(
      (['headline', 'short', 'full'] as const).map((kind) =>
        generateText({
          model: MODEL,
          prompt: buildPrompt(kind, video.title, video.channel.name, transcriptText),
        })
      )
    );
  } catch (err) {
    console.error('[summary/POST] generateText failed:', err);
    const message = err instanceof Error ? err.message : 'Failed to generate summary.';
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const [headlineResult, shortResult, fullResult] = results;

  const usage = {
    headline: serializeUsage(headlineResult.usage),
    short: serializeUsage(shortResult.usage),
    full: serializeUsage(fullResult.usage),
  };

  const summaryData = {
    headline: headlineResult.text.trim(),
    short: shortResult.text.trim(),
    full: fullResult.text.trim(),
    prompt_version: SUMMARY_PROMPT_VERSION,
    model: MODEL,
    usage,
  };

  const saved = await prisma.summary.upsert({
    where: { transcript_id: transcript.id },
    create: { transcript_id: transcript.id, ...summaryData },
    update: summaryData,
    select: {
      headline: true,
      short: true,
      full: true,
      generated_at: true,
    },
  });

  return NextResponse.json({
    headline: saved.headline,
    short: saved.short,
    full: saved.full,
    generatedAt: saved.generated_at,
  });
}
