import { Prisma, prisma } from '@readtube/database';
import { NextRequest, NextResponse } from 'next/server';

import { requireUserId } from '@/lib/auth';

interface Params {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const authResult = await requireUserId();
  if (authResult instanceof NextResponse) {
    return authResult;
  }
  const userId = authResult;
  const { id } = await params;

  let body: { name?: string; sortOrder?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  const existing = await prisma.playlist.findFirst({
    where: { id, user_id: userId },
    select: { id: true },
  });
  if (existing == null) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const updates: { name?: string; sort_order?: number } = {};
  if (body.name != null) {
    const trimmed = body.name.trim();
    if (trimmed.length === 0 || trimmed.length > 80) {
      return NextResponse.json({ error: 'Invalid playlist name' }, { status: 400 });
    }
    updates.name = trimmed;
  }
  if (body.sortOrder != null) {
    if (!Number.isInteger(body.sortOrder)) {
      return NextResponse.json({ error: 'sortOrder must be an integer' }, { status: 400 });
    }
    updates.sort_order = body.sortOrder;
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
  }

  try {
    const row = await prisma.playlist.update({
      where: { id },
      data: updates,
      select: { id: true, name: true, sort_order: true },
    });
    return NextResponse.json({ id: row.id, name: row.name, sortOrder: row.sort_order });
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === 'P2002' &&
      updates.name != null
    ) {
      return NextResponse.json(
        { error: `A playlist named "${updates.name}" already exists.` },
        { status: 409 }
      );
    }
    throw err;
  }
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  const authResult = await requireUserId();
  if (authResult instanceof NextResponse) {
    return authResult;
  }
  const userId = authResult;
  const { id } = await params;

  const result = await prisma.playlist.deleteMany({ where: { id, user_id: userId } });
  if (result.count === 0) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  return NextResponse.json({ deleted: true });
}
