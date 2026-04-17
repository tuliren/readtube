import { prisma } from '@readtube/database';
import { NextResponse } from 'next/server';

import { requireUserId } from '@/lib/auth';
import { assertUserCanTouchVideo, starVideo, unstarVideo } from '@/lib/inbox/triageActions';

interface Params {
  params: Promise<{ id: string }>;
}

export async function POST(_request: Request, { params }: Params) {
  const authResult = await requireUserId();
  if (authResult instanceof NextResponse) {
    return authResult;
  }
  const userId = authResult;
  const { id } = await params;

  console.info(`[videos/star/POST] Starring video ${id} for user ${userId}`);

  const ok = await assertUserCanTouchVideo(prisma, { userId, videoId: id });
  if (!ok) {
    console.error(`[videos/star/POST] Video ${id} not accessible by user ${userId}`);
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  await starVideo(prisma, userId, id);
  return NextResponse.json({ starred: true });
}

export async function DELETE(_request: Request, { params }: Params) {
  const authResult = await requireUserId();
  if (authResult instanceof NextResponse) {
    return authResult;
  }
  const userId = authResult;
  const { id } = await params;

  console.info(`[videos/star/DELETE] Unstarring video ${id} for user ${userId}`);

  // Idempotent: we don't bother checking ownership before a no-op delete.
  // deleteMany is scoped to user_id, so there's no IDOR risk.
  await unstarVideo(prisma, userId, id);
  return NextResponse.json({ starred: false });
}
