import { prisma } from '@readtube/database';
import { NextResponse } from 'next/server';

import { requireUserId } from '@/lib/auth';
import { archiveVideo, assertUserCanTouchVideo, unarchiveVideo } from '@/lib/inbox/triageActions';

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

  console.info(`[videos/archive/POST] Archiving video ${id} for user ${userId}`);

  const ok = await assertUserCanTouchVideo(prisma, { userId, videoId: id });
  if (!ok) {
    console.error(`[videos/archive/POST] Video ${id} not accessible by user ${userId}`);
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  await archiveVideo(prisma, userId, id);
  return NextResponse.json({ archived: true });
}

export async function DELETE(_request: Request, { params }: Params) {
  const authResult = await requireUserId();
  if (authResult instanceof NextResponse) {
    return authResult;
  }
  const userId = authResult;
  const { id } = await params;

  console.info(`[videos/archive/DELETE] Unarchiving video ${id} for user ${userId}`);

  await unarchiveVideo(prisma, userId, id);
  return NextResponse.json({ archived: false });
}
