import { auth } from '@clerk/nextjs/server';
import { ArticleStyle, prisma } from '@readtube/database';
import { NextRequest, NextResponse } from 'next/server';
import { getRun, start } from 'workflow/api';

import { DEFAULT_AI_MODEL } from '@/constants';
import { findOrCloneArticle, resolveTranscriptLanguage } from '@/lib/language/cache';
import { buildLanguageRule } from '@/lib/language/prompt';
import { resolveTargetLanguage } from '@/lib/language/resolve';
import { parseMarkdownDocument } from '@/lib/markdownFrontmatter';
import { ensureTranscript } from '@/lib/transcripts/ensureTranscript';
import { type ArticleStreamEvent, articleWorkflow } from '@/lib/workflows/article';
import { ARTICLE_PROMPT_VERSION } from '@/lib/workflows/article/steps';
import { claimArticleRun, findActiveArticleRun } from '@/lib/workflows/runRegistry';
import { NDJSON_HEADERS, ndjsonResponseFromRun } from '@/lib/workflows/streamResponse';

// Must be a literal — Next.js's route-segment-config analyzer can't
// follow imports. See `GENERATION_MAX_DURATION_SECONDS` in
// `@/constants` for the rationale; keep this in lockstep with that
// value and the matching workflow `maxDuration`.
export const maxDuration = 800;

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

function buildPrompt(
  style: ArticleStyle,
  target: string | null,
  sourceLanguage: string | null,
  title: string,
  channelName: string,
  transcript: string
) {
  const styleGuidance =
    style === ArticleStyle.DIALOG
      ? `- Format the article as a dialog or interview transcript, preserving exchanges between speakers when the video is conversational.
- If there's only one speaker, format as a reflective monologue with paragraph breaks.`
      : `- Reformat the transcript as an article in GitHub Flavored Markdown. This is a re-formatting task, not a rewriting or summarization task.`;

  return `${buildLanguageRule(target, sourceLanguage)}

You are an expert editor turning video transcripts into clean, well-formatted articles.

CRITICAL FIDELITY REQUIREMENT: Do NOT summarize, condense, abstract, paraphrase for brevity, or skip any substantive content. Every idea, argument, example, number, quote, and concrete detail in the transcript must appear in the article. The finished article should be roughly the same length as the transcript minus filler words — NOT shorter. If you find yourself compressing or omitting, stop and include the material.

Instructions:
${styleGuidance}
- Structure the article with \`##\` section headings (and \`###\` subheadings where helpful) at every natural topic shift, so the reader can scan and navigate. Aim for a heading roughly every few hundred words; long unbroken prose with no sectioning is a failure mode to avoid. Write descriptive headings that summarize their section, not generic ones like "Introduction" or "Part 1". Skip headings only when the entire article is a single short topic.
- Use whatever Markdown features best suit the content. Beyond headings and subheadings, also use lists, blockquotes, tables (for comparisons / specs / enumerations), fenced code blocks (for code, commands, file paths, or configuration), inline code for short technical tokens, bold and italic emphasis, horizontal rules to separate unrelated sections, and links where the speaker references them. Pick the feature that best represents each chunk of content.
- Remove only filler words ("um", "uh", "like", "you know"), false starts, repeated words, and verbal tics. Do not remove substantive content.
- Preserve the speaker's voice, phrasing, and stylistic quirks. Keep concrete details, numbers, and examples verbatim.
- Do not invent facts, claims, or details that aren't in the transcript.
- Do not include the video title as a top-level heading — it will be shown separately.
- Start directly with the article content. No preamble of any kind, in any language. Do NOT prefix the article with framing sentences such as "Here is the article", "Below is the article", "The following is...", "以下是...", "下面是...", "이하는...", "次のように...", or any equivalent. The very first character of the output must be the first character of the article body itself (a heading, the opening of the first paragraph, etc.).

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
  const target = await resolveTargetLanguage(
    prisma,
    userId,
    request.nextUrl.searchParams.get('language')
  );

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

  // If a generation is in flight for this slot, tap into its stream
  // instead of returning the cached row. See the summary route for
  // the full rationale — same flow, same UX promise.
  const activeRun = await findActiveArticleRun(prisma, transcript.id, style, target);
  if (activeRun != null) {
    console.info(
      `[article/GET] Tapping into active run ${activeRun.runId} for video ${id} (style=${style}, language=${target ?? 'original'})`
    );
    return ndjsonResponseFromRun<ArticleStreamEvent>(activeRun.runId);
  }

  const article = await findOrCloneArticle(prisma, transcript.id, style, target);
  // Guard against content == null. The runRegistry's stale-cleanup
  // path (findActiveArticleRun) DELETEs fresh-claim rows rather
  // than flipping them to READY, so a READY row should always have
  // content. Treat any READY-with-null-content row as "not cached"
  // belt-and-suspenders so a future code path that lands one
  // doesn't 500 the client downstream (parseMarkdownDocument
  // throws on null).
  if (article == null || article.content == null) {
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
  const target = await resolveTargetLanguage(
    prisma,
    userId,
    request.nextUrl.searchParams.get('language')
  );

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

  // If a generation is already running for this (transcript, style,
  // target) slot, tap into the existing stream instead of starting a
  // duplicate workflow. Skipped when `force` is set — the dev-only
  // Regenerate button explicitly wants a fresh run, and tapping in
  // would replay the in-flight one's content instead.
  if (!force) {
    const activeRun = await findActiveArticleRun(prisma, transcript.id, style, target);
    if (activeRun != null) {
      console.info(
        `[article/POST] Tapping into active run ${activeRun.runId} for video ${id} (style=${style}, language=${target ?? 'original'})`
      );
      return ndjsonResponseFromRun<ArticleStreamEvent>(activeRun.runId);
    }
  }

  // Cache hit: replay the stored article as a single-event NDJSON
  // stream so the client's POST handler only has to know one wire
  // format. Skipped when `force` is set — the dev-only Regenerate
  // button wants a fresh LLM run. Use findOrCloneArticle so a
  // request for a target language whose Original happens to already
  // be in that language gets promoted (single UPDATE) instead of
  // regenerating.
  const cached = force ? null : await findOrCloneArticle(prisma, transcript.id, style, target);

  // findOrCloneArticle only returns READY rows, which always have
  // content — but the schema column is nullable to accommodate
  // GENERATING rows that don't have it yet. Guard explicitly so the
  // type narrows.
  if (cached != null && cached.content != null) {
    const parsed = parseMarkdownDocument(cached.content);
    const hasLatex = parsed.properties.hasLatex === true;
    const cachedEncoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const emit = (event: object) => {
          controller.enqueue(cachedEncoder.encode(JSON.stringify(event) + '\n'));
        };
        emit({ delta: parsed.content });
        emit({ hasLatex });
        emit({ type: 'done' });
        controller.close();
      },
    });
    return new Response(stream, { headers: NDJSON_HEADERS });
  }

  const transcriptText = transcript.segments.map((s) => s.text).join(' ');

  // For "Original" requests, detect the transcript's source language
  // server-side and feed it to the prompt builder. See the matching
  // call in the summary route for the rationale — this avoids relying
  // on the model to detect from prompt body, which has been unreliable
  // on transcripts with mixed scripts or heavy code-switching. Falls
  // back to English when franc can't decide. Skipped for explicit
  // target-language requests since those force translation anyway.
  const sourceLanguage =
    target == null ? await resolveTranscriptLanguage(prisma, transcript.id) : null;

  // Run generation as a Vercel Workflow so it survives the request
  // lifecycle: even if the client closes the tab mid-stream, the
  // workflow keeps running, persists the row on completion, and the
  // user picks it up via the existing-article GET on next visit.
  // Persistence is all-or-nothing — only the final persist step
  // touches the DB, so a half-streamed article never lands.
  const run = await start(articleWorkflow, [
    {
      prompt: buildPrompt(
        style,
        target,
        sourceLanguage,
        video.title,
        video.channel.name,
        transcriptText
      ),
      transcriptId: transcript.id,
      style,
      language: target,
    },
  ]);

  // Claim the registry slot so future GETs / regen clicks tap in.
  // Skipped when `force` is set — Regenerate requests intentionally
  // run a fresh workflow without registering, so a third party
  // glancing at the article tab doesn't yank itself off the cached
  // stable copy onto the in-flight regen. On a concurrent claim
  // race we cancel our own start and stream the winner.
  if (!force) {
    const claim = await claimArticleRun(
      prisma,
      transcript.id,
      style,
      target,
      run.runId,
      ARTICLE_PROMPT_VERSION,
      DEFAULT_AI_MODEL
    );
    if (!claim.weWon) {
      console.info(
        `[article/POST] Lost claim race; cancelling ${run.runId} and tapping into ${claim.winningRunId}`
      );
      try {
        await getRun(run.runId).cancel();
      } catch {
        // ignore — the stray run will expire on its own
      }
      return ndjsonResponseFromRun<ArticleStreamEvent>(claim.winningRunId);
    }
  }

  return ndjsonResponseFromRun<ArticleStreamEvent>(run.runId);
}
