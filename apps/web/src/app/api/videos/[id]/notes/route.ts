import { prisma } from '@readtube/database';
import { NextRequest, NextResponse } from 'next/server';

import { requireUserId } from '@/lib/auth';

async function assertUserCanTouchVideo(userId: string, videoId: string): Promise<boolean> {
  const row = await prisma.video.findFirst({
    where: {
      id: videoId,
      channel: { subscriptions: { some: { user_id: userId } } },
    },
    select: { id: true },
  });
  return row != null;
}

interface Params {
  params: Promise<{ id: string }>;
}

interface NoteData {
  id: string;
  body: string;
  timestampMs: number | null;
  createdAt: string;
  updatedAt: string;
}

function toData(row: {
  id: string;
  body: string;
  timestamp_ms: number | null;
  created_at: Date;
  updated_at: Date;
}): NoteData {
  return {
    id: row.id,
    body: row.body,
    timestampMs: row.timestamp_ms,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export async function GET(_request: NextRequest, { params }: Params) {
  const authResult = await requireUserId();
  if (authResult instanceof NextResponse) {
    return authResult;
  }
  const userId = authResult;
  const { id } = await params;

  const ok = await assertUserCanTouchVideo(userId, id);
  if (!ok) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const rows = await prisma.note.findMany({
    where: { user_id: userId, video_id: id },
    orderBy: [{ timestamp_ms: 'asc' }, { created_at: 'asc' }],
    select: {
      id: true,
      body: true,
      timestamp_ms: true,
      created_at: true,
      updated_at: true,
    },
  });

  return NextResponse.json(rows.map(toData));
}

export async function POST(request: NextRequest, { params }: Params) {
  const authResult = await requireUserId();
  if (authResult instanceof NextResponse) {
    return authResult;
  }
  const userId = authResult;
  const { id } = await params;

  let body: { body?: string; timestampMs?: number | null };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  const text = body.body?.trim() ?? '';
  if (text.length === 0) {
    return NextResponse.json({ error: 'Empty note body' }, { status: 400 });
  }
  if (text.length > 10000) {
    return NextResponse.json({ error: 'Note too long' }, { status: 400 });
  }

  const ok = await assertUserCanTouchVideo(userId, id);
  if (!ok) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const timestampMs =
    body.timestampMs == null
      ? null
      : Number.isInteger(body.timestampMs) && body.timestampMs >= 0
        ? body.timestampMs
        : null;

  const row = await prisma.note.create({
    data: {
      user_id: userId,
      video_id: id,
      body: text,
      timestamp_ms: timestampMs,
    },
    select: {
      id: true,
      body: true,
      timestamp_ms: true,
      created_at: true,
      updated_at: true,
    },
  });

  return NextResponse.json(toData(row), { status: 201 });
}
