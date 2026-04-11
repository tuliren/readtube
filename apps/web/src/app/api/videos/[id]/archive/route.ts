import { NextResponse } from 'next/server';

import { requireUserId } from '@/lib/auth';
import { prisma } from '@/lib/db';
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

  const ok = await assertUserCanTouchVideo(prisma, { userId, videoId: id });
  if (!ok) {
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

  await unarchiveVideo(prisma, userId, id);
  return NextResponse.json({ archived: false });
}
