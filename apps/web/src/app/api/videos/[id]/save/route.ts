import { prisma } from '@readtube/database';
import { NextResponse } from 'next/server';

import { requireUserId } from '@/lib/auth';
import { assertUserCanTouchVideo, saveVideo, unsaveVideo } from '@/lib/inbox/triageActions';

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

  console.info(`[videos/save/POST] Saving video ${id} for user ${userId}`);

  const ok = await assertUserCanTouchVideo(prisma, { userId, videoId: id });
  if (!ok) {
    console.error(`[videos/save/POST] Video ${id} not accessible by user ${userId}`);
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  await saveVideo(prisma, userId, id);
  return NextResponse.json({ saved: true });
}

export async function DELETE(_request: Request, { params }: Params) {
  const authResult = await requireUserId();
  if (authResult instanceof NextResponse) {
    return authResult;
  }
  const userId = authResult;
  const { id } = await params;

  console.info(`[videos/save/DELETE] Unsaving video ${id} for user ${userId}`);

  await unsaveVideo(prisma, userId, id);
  return NextResponse.json({ saved: false });
}
