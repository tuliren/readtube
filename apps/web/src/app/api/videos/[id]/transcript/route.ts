import { auth } from '@clerk/nextjs/server';
import { prisma } from '@readtube/database';
import { NextRequest, NextResponse } from 'next/server';

import { ensureTranscript } from '@/lib/transcripts/ensureTranscript';

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (userId == null) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

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
      transcript_unavailable: true,
      transcripts: {
        orderBy: { created_at: 'desc' },
        take: 1,
        select: { text: true, language: true },
      },
    },
  });
  if (!video) {
    return NextResponse.json({ error: 'Video not found' }, { status: 404 });
  }

  const cached = video.transcripts[0];
  if (cached != null) {
    return NextResponse.json({ segments: JSON.parse(cached.text), language: cached.language });
  }

  // 410 Gone signals "we already tried and there is nothing here" so
  // the client can render a permanent unavailable state without
  // offering a retry button. 404 stays reserved for "we haven't tried
  // yet" — the client renders a Fetch button for that path.
  if (video.transcript_unavailable) {
    return NextResponse.json(
      { error: 'Transcript unavailable', code: 'unavailable' },
      { status: 410 }
    );
  }

  return NextResponse.json({ error: 'Not cached' }, { status: 404 });
}

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (userId == null) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  // ensureTranscript handles the whole pipeline: IDOR check, cache
  // hit, sticky-unavailable short circuit, upstream fetch, and the
  // sticky flag write on failure. The route just maps the result.
  const result = await ensureTranscript(prisma, userId, id);
  if (!result.ok) {
    if (result.reason === 'not-found') {
      return NextResponse.json({ error: 'Video not found' }, { status: 404 });
    }
    if (result.reason === 'transient-error') {
      return NextResponse.json(
        { error: 'Transcript fetch failed temporarily — please try again.', code: 'transient' },
        { status: 503 }
      );
    }
    return NextResponse.json(
      { error: 'Transcript unavailable', code: 'unavailable' },
      { status: 410 }
    );
  }

  return NextResponse.json({ segments: result.transcript.segments });
}
