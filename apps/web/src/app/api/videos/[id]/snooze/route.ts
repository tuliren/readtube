import { prisma } from '@readtube/database';
import { NextRequest, NextResponse } from 'next/server';

import { requireUserId } from '@/lib/auth';
import { assertUserCanTouchVideo, snoozeVideo, unsnoozeVideo } from '@/lib/inbox/triageActions';

interface Params {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, { params }: Params) {
  const authResult = await requireUserId();
  if (authResult instanceof NextResponse) {
    return authResult;
  }
  const userId = authResult;
  const { id } = await params;

  let body: { snoozeUntil?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  if (body.snoozeUntil == null || body.snoozeUntil === '') {
    return NextResponse.json({ error: 'Missing snoozeUntil' }, { status: 400 });
  }
  const until = new Date(body.snoozeUntil);
  if (Number.isNaN(until.getTime())) {
    return NextResponse.json({ error: 'Invalid snoozeUntil' }, { status: 400 });
  }
  if (until.getTime() <= Date.now()) {
    return NextResponse.json({ error: 'snoozeUntil must be in the future' }, { status: 400 });
  }

  const ok = await assertUserCanTouchVideo(prisma, { userId, videoId: id });
  if (!ok) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  await snoozeVideo(prisma, userId, id, until);
  return NextResponse.json({ snoozedUntil: until.toISOString() });
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  const authResult = await requireUserId();
  if (authResult instanceof NextResponse) {
    return authResult;
  }
  const userId = authResult;
  const { id } = await params;

  await unsnoozeVideo(prisma, userId, id);
  return NextResponse.json({ snoozedUntil: null });
}
