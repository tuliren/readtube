import { auth } from '@clerk/nextjs/server';
import { UserRequestOutcome, prisma } from '@readtube/database';
import { NextRequest, NextResponse } from 'next/server';
import { getRun, start } from 'workflow/api';

import { DEFAULT_AI_MODEL } from '@/constants';
import { findOrCloneSummary, resolveTranscriptLanguage } from '@/lib/language/cache';
import { resolveTargetLanguage } from '@/lib/language/resolve';
import { parseMarkdownDocument } from '@/lib/markdownFrontmatter';
import { ensureTranscript } from '@/lib/transcripts/ensureTranscript';
import { recordSummaryRequest } from '@/lib/usage/userRequest';
import { claimSummaryRun, findActiveSummaryRun } from '@/lib/workflows/runRegistry';
import { NDJSON_HEADERS, ndjsonResponseFromRun } from '@/lib/workflows/streamResponse';
import { type SummaryStreamEvent, summaryWorkflow } from '@/lib/workflows/summary';
import {
  SUMMARY_FIELDS,
  SUMMARY_PROMPT_VERSION,
  type SummaryField,
} from '@/lib/workflows/summary/steps';

import { buildSummaryPrompt } from './buildPrompt';

// Must be a literal — Next.js's route-segment-config analyzer can't
// follow imports. See `GENERATION_MAX_DURATION_SECONDS` in
// `@/constants` for the rationale; keep this in lockstep with that
// value and the matching workflow `maxDuration`.
export const maxDuration = 800;

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (userId == null) {
    console.error('[summary/GET] Unauthorized');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const target = await resolveTargetLanguage(
    prisma,
    userId,
    request.nextUrl.searchParams.get('language')
  );

  console.info(
    `[summary/GET] Fetching cached summary for video ${id}, user ${userId}, language ${target ?? 'original'}`
  );

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
    console.error(`[summary/GET] Video ${id} not accessible by user ${userId}`);
    return NextResponse.json({ error: 'Video not found' }, { status: 404 });
  }

  const transcript = video.transcripts[0];
  if (!transcript) {
    console.error(`[summary/GET] No transcript for video ${id}`);
    return NextResponse.json({ error: 'Not cached' }, { status: 404 });
  }

  // If a generation is in flight for this slot, tap into its stream
  // instead of returning the cached row. This is what lets a refresh
  // mid-generation pick up the live progress instead of bouncing back
  // to the Generate button. The client switches into streaming mode
  // when it sees the NDJSON content-type, reusing the same delta
  // consumer it already has for POST.
  const activeRun = await findActiveSummaryRun(prisma, transcript.id, target);
  if (activeRun != null) {
    console.info(
      `[summary/GET] Tapping into active run ${activeRun.runId} for video ${id} (language ${target ?? 'original'})`
    );
    return ndjsonResponseFromRun<SummaryStreamEvent>(activeRun.runId);
  }

  const summary = await findOrCloneSummary(prisma, transcript.id, target);
  if (summary == null) {
    console.error(
      `[summary/GET] No cached summary for video ${id} in language ${target ?? 'original'}`
    );
    return NextResponse.json({ error: 'Not cached' }, { status: 404 });
  }

  return NextResponse.json({
    headline: summary.headline,
    short: summary.short,
    full: summary.full,
    language: summary.language,
    generatedAt: summary.generated_at,
  });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (userId == null) {
    console.error('[summary/POST] Unauthorized');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const target = await resolveTargetLanguage(
    prisma,
    userId,
    request.nextUrl.searchParams.get('language')
  );

  console.info(
    `[summary/POST] Generating summary for video ${id}, user ${userId}, language ${target ?? 'original'}`
  );

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

  // Audit-log helper used at every terminal branch below. Wrapped in
  // try/catch — a failed audit row must never break the user's
  // request. The video.id resolved by the IDOR check above is reused
  // so the FK to Video is always valid.
  const recordSafe = async (
    outcome: UserRequestOutcome,
    extra: {
      summaryId?: string | null;
      workflowId?: string | null;
      errorMessage?: string | null;
    } = {}
  ): Promise<{ id: string } | null> => {
    try {
      return await recordSummaryRequest(prisma, {
        userId,
        videoId: video.id,
        outcome,
        language: target,
        model: DEFAULT_AI_MODEL,
        promptVersion: SUMMARY_PROMPT_VERSION,
        summaryId: extra.summaryId ?? null,
        workflowId: extra.workflowId ?? null,
        errorMessage: extra.errorMessage ?? null,
      });
    } catch (err) {
      console.error('[summary/POST] failed to record UserRequest:', err);
      return null;
    }
  };

  // Auto-fetch the transcript if it isn't already cached. The single
  // ensureTranscript call replaces "expect transcript or 400" — the
  // user clicks Generate once and the route transparently ensures
  // there's something to feed the model. If the upstream provider
  // can't deliver captions, ensureTranscript flips the sticky
  // transcript_unavailable flag on the Video so we don't waste a
  // round-trip on the next click. ensureTranscript records its own
  // TRANSCRIPT UserRequest row; the SUMMARY rows below are
  // independent so each cost (upstream API vs LLM) is attributable.
  const ensured = await ensureTranscript(prisma, userId, id);
  if (!ensured.ok) {
    if (ensured.reason === 'not-found') {
      console.error(`[summary/POST] Video ${id} not found during ensureTranscript`);
      // Don't write a SUMMARY UserRequest for IDOR — see the matching
      // skip in ensureTranscript for the rationale.
      return NextResponse.json({ error: 'Video not found' }, { status: 404 });
    }
    if (ensured.reason === 'transient-error') {
      console.error(`[summary/POST] Transient transcript fetch error for video ${id}`);
      await recordSafe(UserRequestOutcome.TRANSIENT_ERROR, {
        errorMessage: 'transcript-transient',
      });
      return NextResponse.json(
        {
          error: 'Could not fetch the transcript right now — please try again.',
          code: 'transient',
        },
        { status: 503 }
      );
    }
    console.error(`[summary/POST] Transcript unavailable for video ${id}`);
    // Summary itself was never attempted — record as FAILED with the
    // upstream cause in error_message rather than leaking a transcript
    // outcome value into the SUMMARY type.
    await recordSafe(UserRequestOutcome.FAILED, {
      errorMessage: 'transcript-unavailable',
    });
    return NextResponse.json(
      { error: 'Transcript unavailable for this video.', code: 'unavailable' },
      { status: 410 }
    );
  }
  const transcript = ensured.transcript;
  const transcriptText = transcript.segments.map((s) => s.text).join(' ');

  // If a generation is already running for this slot — same user
  // clicked Generate twice, or two clients hit the same video at
  // once — tap into the existing stream rather than firing off a
  // duplicate workflow. Skipped for per-field regenerate clicks
  // (fields ⊂ all) since the user explicitly asked for a fresh run
  // of those fields and tapping in would replay whatever the
  // already-running workflow is doing for a *different* set of
  // fields. The fields themselves are stored in the workflow input,
  // not the registry, so we can't cleanly distinguish — easier to
  // skip the short-circuit and let the regen go through.
  //
  // Tap-ins don't write a UserRequest — no LLM cost is incurred by
  // the tapped client. The original GENERATED row owns attribution.
  const isFullGenerate = fieldsToGenerate.length === SUMMARY_FIELDS.length;
  if (isFullGenerate) {
    const activeRun = await findActiveSummaryRun(prisma, transcript.id, target);
    if (activeRun != null) {
      console.info(
        `[summary/POST] Tapping into active run ${activeRun.runId} for video ${id} (language ${target ?? 'original'})`
      );
      return ndjsonResponseFromRun<SummaryStreamEvent>(activeRun.runId);
    }
  }

  // Cache + clone short-circuit. Mirrors the article POST cache check:
  // if the user clicked the main "Generate" button (all 3 fields
  // requested) and a row already exists for `(transcript, target)` —
  // either via a direct hit or by cloning the Original when its
  // language matches the picker target — replay that row as NDJSON
  // instead of running the LLM. Per-field regenerate (fields ⊂ all)
  // skips this path because that click means "fresh content for THIS
  // field", and cloning would defeat it.
  //
  // Cache hits don't write a UserRequest — no LLM cost is incurred.
  const cached = isFullGenerate ? await findOrCloneSummary(prisma, transcript.id, target) : null;
  if (cached != null && cached.headline != null && cached.short != null && cached.full != null) {
    const shortDoc = parseMarkdownDocument(cached.short);
    const fullDoc = parseMarkdownDocument(cached.full);
    const cachedEncoder = new TextEncoder();
    const cachedStream = new ReadableStream<Uint8Array>({
      start(controller) {
        const emit = (event: object) => {
          controller.enqueue(cachedEncoder.encode(JSON.stringify(event) + '\n'));
        };
        emit({ field: 'headline', delta: cached.headline });
        emit({
          field: 'short',
          delta: shortDoc.frontmatterPending ? cached.short : shortDoc.content,
        });
        emit({ field: 'short', hasLatex: shortDoc.properties.hasLatex === true });
        emit({
          field: 'full',
          delta: fullDoc.frontmatterPending ? cached.full : fullDoc.content,
        });
        emit({ field: 'full', hasLatex: fullDoc.properties.hasLatex === true });
        emit({ type: 'done' });
        controller.close();
      },
    });
    return new Response(cachedStream, { headers: NDJSON_HEADERS });
  }

  // For "Original" requests, detect the transcript's source language
  // server-side and feed it to the prompt builder. Asking the model
  // to detect from the transcript body has been unreliable on
  // transcripts with mixed scripts or heavy code-switching — it would
  // sometimes pick a neighboring language (Spanish for English,
  // Korean for Japanese, etc.). Falls back to English when franc
  // can't decide; deterministic and predictable beats a coin flip.
  // Skipped for explicit target-language requests since those force
  // translation anyway and don't care about the source.
  const sourceLanguage =
    target == null ? await resolveTranscriptLanguage(prisma, transcript.id) : null;

  // Insert the SUMMARY UserRequest *before* starting the workflow so
  // its id can be threaded into the workflow input. The persist step
  // backfills `usage` and `completed_at`; the revert step on failure
  // flips outcome=FAILED. We pass userRequestId only for full-generate
  // runs because per-field regen is a fire-and-forget click that
  // doesn't need its tokens attributed back to a synchronous request
  // row (and the workflow currently writes only one row's worth of
  // usage; mixing them across regen runs would clobber prior data).
  const userRequest = isFullGenerate ? await recordSafe(UserRequestOutcome.GENERATED) : null;

  // Run generation as a Vercel Workflow so it survives the request
  // lifecycle — see the article route for the full rationale.
  const run = await start(summaryWorkflow, [
    {
      fieldsToGenerate,
      prompt: buildSummaryPrompt(
        fieldsToGenerate,
        target,
        sourceLanguage,
        video.title,
        video.channel.name,
        transcriptText
      ),
      transcriptId: transcript.id,
      language: target,
      userRequestId: userRequest?.id ?? null,
    },
  ]);

  // Claim the row for this slot so future GETs / regen clicks tap
  // in. Only claim for full-generate runs — per-field regenerate
  // writes to specific fields and doesn't represent a "fresh
  // generation in progress" the user would want to subscribe to
  // (the click is a fire-and-forget action). On a concurrent claim
  // race we cancel our own start and stream the winner instead.
  if (isFullGenerate) {
    const claim = await claimSummaryRun(
      prisma,
      transcript.id,
      target,
      run.runId,
      SUMMARY_PROMPT_VERSION,
      DEFAULT_AI_MODEL
    );
    if (!claim.weWon) {
      console.info(
        `[summary/POST] Lost claim race; cancelling ${run.runId} and tapping into ${claim.winningRunId}`
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
          console.error('[summary/POST] failed to delete claim-race UserRequest:', err);
        }
      }
      return ndjsonResponseFromRun<SummaryStreamEvent>(claim.winningRunId);
    }
    // We won — stamp our own runId on the audit row for trace.
    if (userRequest != null) {
      try {
        await prisma.userRequest.update({
          where: { id: userRequest.id },
          data: { workflow_id: run.runId },
        });
      } catch (err) {
        console.error('[summary/POST] failed to stamp workflow_id on UserRequest:', err);
      }
    }
  }

  return ndjsonResponseFromRun<SummaryStreamEvent>(run.runId);
}
