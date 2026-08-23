import { auth } from '@clerk/nextjs/server';
import { VideoPlatformType, prisma } from '@readtube/database';
import { NextRequest, NextResponse } from 'next/server';

import { TRANSCRIPT_GENERATION_MAX_VIDEO_SECONDS } from '@/constants';
import { ensureTranscript } from '@/lib/transcripts/ensureTranscript';
import { findActiveTranscriptGeneration } from '@/lib/workflows/runRegistry';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (userId == null) {
    console.error('[videos/transcript/GET] Unauthorized');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  // `?poll=1` asks for live generation state alongside an existing
  // transcript — used by the dev Regenerate flow to tell when a fresh
  // run has landed (new transcript id) or failed. Off the hot path:
  // normal reads skip the extra getRun probe.
  const withGeneration = request.nextUrl.searchParams.get('poll') === '1';

  console.info(`[videos/transcript/GET] Fetching transcript for video ${id}, user ${userId}`);

  // IDOR check + fetch most recent cached transcript + the sticky
  // unavailable flag in one round-trip.
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
      duration_seconds: true,
      transcript_unavailable: true,
      transcript_generation_error: true,
      transcripts: {
        orderBy: { created_at: 'desc' },
        take: 1,
        select: { id: true, text: true, language: true, source: true },
      },
    },
  });
  if (!video) {
    console.error(`[videos/transcript/GET] Video ${id} not accessible by user ${userId}`);
    return NextResponse.json({ error: 'Video not found' }, { status: 404 });
  }

  const cached = video.transcripts[0];
  if (cached != null) {
    // In poll mode, report whether a (re)generation is still in flight
    // so the client can distinguish "new transcript landed" (id changed)
    // from "the run reverted" (state failed). findActiveTranscriptGeneration
    // also cleans up stale GENERATING markers, so a dead run surfaces as
    // 'failed' rather than polling forever.
    let generation:
      | { state: 'idle' | 'generating' | 'failed'; errorMessage: string | null }
      | undefined;
    if (withGeneration) {
      const active = await findActiveTranscriptGeneration(prisma, video.id);
      const state =
        active != null
          ? 'generating'
          : video.transcript_generation_error != null
            ? 'failed'
            : 'idle';
      generation = {
        state,
        errorMessage: state === 'failed' ? video.transcript_generation_error : null,
      };
    }
    return NextResponse.json({
      id: cached.id,
      segments: JSON.parse(cached.text),
      language: cached.language,
      source: cached.source,
      ...(generation != null ? { generation } : {}),
    });
  }

  // 410 Gone signals "the captions path already ran and there is
  // nothing there" — but with AI generation available, it is no longer
  // a dead end. The `generation` payload tells the client whether to
  // offer the Generate button, show in-flight progress (this GET is
  // also the polling endpoint), or surface the last failure. 404
  // stays reserved for "we haven't tried yet" — the client renders a
  // Fetch button for that path.
  if (video.transcript_unavailable) {
    console.info(`[videos/transcript/GET] Transcript sticky-unavailable for video ${id}`);
    const eligible =
      video.source_type === VideoPlatformType.YOUTUBE &&
      video.duration_seconds != null &&
      video.duration_seconds <= TRANSCRIPT_GENERATION_MAX_VIDEO_SECONDS;
    const ineligibleReason = eligible
      ? null
      : video.source_type !== VideoPlatformType.YOUTUBE
        ? 'platform'
        : video.duration_seconds == null
          ? 'duration-unknown'
          : 'too-long';
    // findActiveTranscriptGeneration doubles as stale-marker cleanup:
    // a poll after the workflow dies flips the row back to READY with
    // a timeout message, which the next poll reports as 'failed'.
    const active = eligible ? await findActiveTranscriptGeneration(prisma, video.id) : null;
    const state =
      active != null ? 'generating' : video.transcript_generation_error != null ? 'failed' : 'idle';
    return NextResponse.json(
      {
        error: 'Transcript unavailable',
        code: 'unavailable',
        generation: {
          eligible,
          ineligibleReason,
          state,
          errorMessage: state === 'failed' ? video.transcript_generation_error : null,
        },
      },
      { status: 410 }
    );
  }

  console.info(`[videos/transcript/GET] Transcript not cached for video ${id}`);
  return NextResponse.json({ error: 'Not cached' }, { status: 404 });
}

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (userId == null) {
    console.error('[videos/transcript/POST] Unauthorized');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  console.info(`[videos/transcript/POST] Ensuring transcript for video ${id}, user ${userId}`);

  // ensureTranscript handles the whole pipeline: IDOR check, cache
  // hit, sticky-unavailable short circuit, upstream fetch, and the
  // sticky flag write on failure. The route just maps the result.
  const result = await ensureTranscript(prisma, userId, id);
  if (!result.ok) {
    if (result.reason === 'not-found') {
      console.error(`[videos/transcript/POST] Video ${id} not found or not accessible`);
      return NextResponse.json({ error: 'Video not found' }, { status: 404 });
    }
    if (result.reason === 'transient-error') {
      console.error(`[videos/transcript/POST] Transient transcript fetch error for video ${id}`);
      return NextResponse.json(
        { error: 'Transcript fetch failed temporarily — please try again.', code: 'transient' },
        { status: 503 }
      );
    }
    if (result.reason === 'scheduled') {
      // 425 Too Early: the video is a scheduled premiere / upcoming
      // livestream whose transcript doesn't exist yet but should
      // once it airs. Deliberately NOT 410 — we don't want the
      // client to remember this as permanently unavailable.
      console.info(`[videos/transcript/POST] Video ${id} is scheduled, not yet aired`);
      return NextResponse.json(
        {
          error: 'This video has not aired yet. Try again after the scheduled premiere.',
          code: 'scheduled',
          scheduledStartTime: result.scheduledStartTime?.toISOString() ?? null,
        },
        { status: 425 }
      );
    }
    console.error(`[videos/transcript/POST] Transcript unavailable for video ${id}`);
    return NextResponse.json(
      { error: 'Transcript unavailable', code: 'unavailable' },
      { status: 410 }
    );
  }

  return NextResponse.json({ segments: result.transcript.segments });
}
