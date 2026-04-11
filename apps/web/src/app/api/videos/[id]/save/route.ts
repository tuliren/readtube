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

  const ok = await assertUserCanTouchVideo(prisma, { userId, videoId: id });
  if (!ok) {
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

  await unsaveVideo(prisma, userId, id);
  return NextResponse.json({ saved: false });
}
