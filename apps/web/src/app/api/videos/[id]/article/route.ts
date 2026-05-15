import { auth } from '@clerk/nextjs/server';
import { ArticleStyle, UserRequestOutcome, prisma } from '@readtube/database';
import { NextRequest, NextResponse } from 'next/server';
import { getRun, start } from 'workflow/api';

import { DEFAULT_AI_MODEL } from '@/constants';
import { findOrCloneArticle, resolveTranscriptLanguage } from '@/lib/language/cache';
import { resolveTargetLanguage } from '@/lib/language/resolve';
import { parseMarkdownDocument } from '@/lib/markdownFrontmatter';
import { ensureTranscript } from '@/lib/transcripts/ensureTranscript';
import { recordArticleRequest } from '@/lib/usage/userRequest';
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

  // Look up title + channel name + duration first; ensureTranscript
  // will do its own IDOR check + transcript resolution. Duration
  // drives the article workflow's strategy selection — videos at or
  // above MAP_REDUCE_THRESHOLD_MINUTES use the map-reduce path.
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
      duration_seconds: true,
      channel: { select: { name: true } },
    },
  });
  if (!video) {
    console.error(`[article/POST] Video ${id} not accessible by user ${userId}`);
    return NextResponse.json({ error: 'Video not found' }, { status: 404 });
  }

  // Audit-log helper used at every terminal branch below. Wrapped in
  // try/catch — a failed audit row must never break the user's
  // request. The video.id resolved by the IDOR check above is reused
  // so the FK to Video is always valid.
  const recordSafe = async (
    outcome: UserRequestOutcome,
    extra: {
      articleId?: string | null;
      workflowId?: string | null;
      errorMessage?: string | null;
    } = {}
  ): Promise<{ id: string } | null> => {
    try {
      return await recordArticleRequest(prisma, {
        userId,
        videoId: video.id,
        outcome,
        language: target,
        style,
        model: DEFAULT_AI_MODEL,
        promptVersion: ARTICLE_PROMPT_VERSION,
        articleId: extra.articleId ?? null,
        workflowId: extra.workflowId ?? null,
        errorMessage: extra.errorMessage ?? null,
      });
    } catch (err) {
      console.error('[article/POST] failed to record UserRequest:', err);
      return null;
    }
  };

  // Auto-fetch the transcript on the user's first Generate click.
  // ensureTranscript caches success and the sticky unavailable flag
  // — same shared helper the summary route uses, so both Generate
  // paths behave identically (single click → wait → result, with
  // no retry for confirmed-unavailable videos). ensureTranscript
  // records its own TRANSCRIPT UserRequest row; the ARTICLE rows
  // below are independent so each cost is attributable.
  const ensured = await ensureTranscript(prisma, userId, id);
  if (!ensured.ok) {
    if (ensured.reason === 'not-found') {
      console.error(`[article/POST] Video ${id} not found during ensureTranscript`);
      return NextResponse.json({ error: 'Video not found' }, { status: 404 });
    }
    if (ensured.reason === 'transient-error') {
      console.error(`[article/POST] Transient transcript fetch error for video ${id}`);
      // No audit row — caller retries, and a successful retry writes
      // its own GENERATED row.
      return NextResponse.json(
        {
          error: 'Could not fetch the transcript right now — please try again.',
          code: 'transient',
        },
        { status: 503 }
      );
    }
    if (ensured.reason === 'scheduled') {
      console.info(`[article/POST] Video ${id} is scheduled, not yet aired`);
      return NextResponse.json(
        {
          error: 'This video has not aired yet. Try again after the scheduled premiere.',
          code: 'scheduled',
          scheduledStartTime: ensured.scheduledStartTime?.toISOString() ?? null,
        },
        { status: 425 }
      );
    }
    console.error(`[article/POST] Transcript unavailable for video ${id}`);
    await recordSafe(UserRequestOutcome.FAILED, {
      errorMessage: 'transcript-unavailable',
    });
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
  //
  // Tap-ins don't write a UserRequest — no LLM cost is incurred by
  // the tapped client. The original GENERATED row owns attribution.
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
  //
  // Cache hits don't write a UserRequest — no LLM cost is incurred.
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

  // For "Original" requests, detect the transcript's source language
  // server-side and feed it to the strategy. See the matching call in
  // the summary route for the rationale — this avoids relying on the
  // model to detect from prompt body, which has been unreliable on
  // transcripts with mixed scripts or heavy code-switching. Falls
  // back to English when franc can't decide. Skipped for explicit
  // target-language requests since those force translation anyway.
  const sourceLanguage =
    target == null ? await resolveTranscriptLanguage(prisma, transcript.id) : null;

  // Insert the ARTICLE UserRequest *before* starting the workflow so
  // its id can be threaded into the workflow input. The persist step
  // backfills `usage` and `completed_at`; the revert step on failure
  // flips outcome=FAILED. Skipped when force=true — that path is the
  // dev-only Regenerate button and intentionally bypasses the
  // run-registry; we keep audit semantics aligned by skipping the
  // user-request thread too (no row, no backfill).
  const userRequest = force ? null : await recordSafe(UserRequestOutcome.GENERATED);

  // Run generation as a Vercel Workflow so it survives the request
  // lifecycle: even if the client closes the tab mid-stream, the
  // workflow keeps running, persists the row on completion, and the
  // user picks it up via the existing-article GET on next visit.
  // Persistence is all-or-nothing — only the final persist step
  // touches the DB, so a half-streamed article never lands. The
  // workflow's strategy selector reads `durationSeconds` to choose
  // single-pass vs map-reduce.
  const run = await start(articleWorkflow, [
    {
      transcriptId: transcript.id,
      style,
      language: target,
      segments: transcript.segments,
      videoTitle: video.title,
      channelName: video.channel.name,
      sourceLanguage,
      durationSeconds: video.duration_seconds,
      userRequestId: userRequest?.id ?? null,
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
      // Delete the GENERATED row we just inserted — the workflow we
      // started is being canceled, so no LLM cost is incurred against
      // this user. Tap-ins don't get an audit row (the original
      // generator's row owns attribution).
      if (userRequest != null) {
        try {
          await prisma.userRequest.delete({ where: { id: userRequest.id } });
        } catch (err) {
          console.error('[article/POST] failed to delete claim-race UserRequest:', err);
        }
      }
      return ndjsonResponseFromRun<ArticleStreamEvent>(claim.winningRunId);
    }
    if (userRequest != null) {
      try {
        await prisma.userRequest.update({
          where: { id: userRequest.id },
          data: { workflow_id: run.runId },
        });
      } catch (err) {
        console.error('[article/POST] failed to stamp workflow_id on UserRequest:', err);
      }
    }
  }

  return ndjsonResponseFromRun<ArticleStreamEvent>(run.runId);
}
