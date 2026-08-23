import { auth } from '@clerk/nextjs/server';
import { UserRequestOutcome, VideoPlatformType, prisma } from '@readtube/database';
import { NextRequest, NextResponse } from 'next/server';
import { getRun, start } from 'workflow/api';

import { TRANSCRIPT_GENERATION_MAX_VIDEO_SECONDS, TRANSCRIPT_GENERATION_MODEL } from '@/constants';
import { recordTranscriptRequest } from '@/lib/usage/userRequest';
import { VercelEnv, getVercelEnv } from '@/lib/vercelEnv';
import {
  claimTranscriptGeneration,
  findActiveTranscriptGeneration,
} from '@/lib/workflows/runRegistry';
import { transcriptGenerationWorkflow } from '@/lib/workflows/transcript-generation';
import { TRANSCRIPT_GENERATION_PROMPT_VERSION } from '@/lib/workflows/transcript-generation/prompt';

/**
 * Kick off AI transcript generation for a caption-less video. The
 * heavy lifting runs in `transcriptGenerationWorkflow`; this route
 * returns 202 immediately and the client polls the transcript GET
 * route for completion. Generation NEVER runs implicitly — this
 * endpoint only accepts videos where the captions path has already
 * been tried and permanently failed (`transcript_unavailable`).
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (userId == null) {
    console.error('[transcript/generate/POST] Unauthorized');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  // Dev-only regeneration. In production a generated transcript is
  // final (each run costs real money and there is no per-user cap yet),
  // so this override is gated to the local dev server: it lets us
  // re-run generation over an existing transcript to test the pipeline.
  // The client sends `?force=1` from the dev-only Regenerate button; the
  // env gate here is the authority so a crafted request can't regenerate
  // in a deployed environment.
  const forceRegenerate =
    getVercelEnv(process.env.VERCEL_ENV) === VercelEnv.DEVELOPMENT &&
    request.nextUrl.searchParams.get('force') === '1';

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
      source_type: true,
      source_id: true,
      duration_seconds: true,
      transcript_unavailable: true,
      transcripts: {
        orderBy: { created_at: 'desc' },
        take: 1,
        select: { id: true },
      },
    },
  });
  if (video == null) {
    console.error(`[transcript/generate/POST] Video ${id} not accessible by user ${userId}`);
    return NextResponse.json({ error: 'Video not found' }, { status: 404 });
  }

  // A transcript already exists — nothing to generate. The client
  // refetches the GET route and renders it. Skipped under a dev-only
  // force-regenerate, which deliberately re-runs generation over the
  // existing transcript (the workflow writes a new row that supersedes
  // it, since reads take the most recent transcript).
  if (video.transcripts[0] != null && !forceRegenerate) {
    return NextResponse.json({ status: 'ready' });
  }

  if (video.source_type !== VideoPlatformType.YOUTUBE) {
    return NextResponse.json(
      {
        error: 'AI transcript generation is only supported for YouTube videos.',
        code: 'unsupported-platform',
      },
      { status: 422 }
    );
  }

  // Generation is strictly a fallback: the captions path must have
  // been tried and permanently failed first. Without the sticky flag
  // the client should use the normal fetch (POST /transcript).
  if (!video.transcript_unavailable) {
    return NextResponse.json(
      {
        error: 'Captions have not been checked for this video yet. Fetch the transcript first.',
        code: 'captions-not-attempted',
      },
      { status: 409 }
    );
  }

  if (video.duration_seconds == null) {
    return NextResponse.json(
      {
        error: 'The video duration is unknown, so generation cost cannot be bounded.',
        code: 'duration-unknown',
      },
      { status: 422 }
    );
  }
  if (video.duration_seconds > TRANSCRIPT_GENERATION_MAX_VIDEO_SECONDS) {
    const maxHours = TRANSCRIPT_GENERATION_MAX_VIDEO_SECONDS / 3600;
    return NextResponse.json(
      {
        error: `Videos longer than ${maxHours} hours are not supported yet.`,
        code: 'too-long',
      },
      { status: 422 }
    );
  }

  // Idempotency: someone (possibly this same user in another tab) is
  // already generating. Tap in by polling — no new audit row.
  const active = await findActiveTranscriptGeneration(prisma, video.id);
  if (active != null) {
    console.info(
      `[transcript/generate/POST] Generation already in flight for video ${id} (${active.runId})`
    );
    return NextResponse.json({ status: 'generating' }, { status: 202 });
  }

  // Insert the pending audit row before starting so the workflow can
  // backfill usage/outcome. Best-effort — a failed audit write must
  // not block the user's generation.
  let userRequest: { id: string } | null = null;
  try {
    userRequest = await recordTranscriptRequest(prisma, {
      userId,
      videoId: video.id,
      outcome: UserRequestOutcome.GENERATED,
      model: TRANSCRIPT_GENERATION_MODEL,
      promptVersion: TRANSCRIPT_GENERATION_PROMPT_VERSION,
      pending: true,
    });
  } catch (err) {
    console.error('[transcript/generate/POST] failed to record UserRequest:', err);
  }

  const run = await start(transcriptGenerationWorkflow, [
    {
      videoDbId: video.id,
      videoSourceId: video.source_id,
      durationSeconds: video.duration_seconds,
      userId,
      userRequestId: userRequest?.id ?? null,
    },
  ]);

  const claimed = await claimTranscriptGeneration(prisma, video.id, run.runId);
  if (!claimed) {
    // A concurrent claimant won between our findActive check and the
    // claim. Cancel our redundant run and let the client poll the
    // winner's progress. No audit row for tap-ins — the winner's row
    // owns attribution.
    console.info(
      `[transcript/generate/POST] Lost claim race for video ${id}; cancelling ${run.runId}`
    );
    try {
      await getRun(run.runId).cancel();
    } catch {
      // ignore — the stray run will expire on its own
    }
    if (userRequest != null) {
      try {
        await prisma.userRequest.delete({ where: { id: userRequest.id } });
      } catch (err) {
        console.error('[transcript/generate/POST] failed to delete claim-race UserRequest:', err);
      }
    }
    return NextResponse.json({ status: 'generating' }, { status: 202 });
  }

  // We won — stamp our runId on the audit row for trace.
  if (userRequest != null) {
    try {
      await prisma.userRequest.update({
        where: { id: userRequest.id },
        data: { workflow_id: run.runId },
      });
    } catch (err) {
      console.error('[transcript/generate/POST] failed to stamp workflow_id on UserRequest:', err);
    }
  }

  console.info(`[transcript/generate/POST] Started generation ${run.runId} for video ${id}`);
  return NextResponse.json({ status: 'generating' }, { status: 202 });
}
