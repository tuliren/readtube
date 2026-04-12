import { prisma } from '@readtube/database';
import { NextRequest, NextResponse } from 'next/server';

import { requireUserId } from '@/lib/auth';

interface Params {
  params: Promise<{ id: string; noteId: string }>;
}

/**
 * Note edit / delete. Both scoped by user_id so touching another user's
 * note id is a silent 404. videoId in the path is there for URL symmetry
 * and is checked as well.
 */
export async function PATCH(request: NextRequest, { params }: Params) {
  const authResult = await requireUserId();
  if (authResult instanceof NextResponse) {
    return authResult;
  }
  const userId = authResult;
  const { id: videoId, noteId } = await params;

  let body: { body?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  const text = body.body?.trim() ?? '';
  if (text.length === 0 || text.length > 10000) {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  const result = await prisma.note.updateMany({
    where: { id: noteId, user_id: userId, video_id: videoId },
    data: { body: text },
  });
  if (result.count === 0) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  return NextResponse.json({ updated: true });
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  const authResult = await requireUserId();
  if (authResult instanceof NextResponse) {
    return authResult;
  }
  const userId = authResult;
  const { id: videoId, noteId } = await params;

  const result = await prisma.note.deleteMany({
    where: { id: noteId, user_id: userId, video_id: videoId },
  });
  if (result.count === 0) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  return NextResponse.json({ deleted: true });
}
