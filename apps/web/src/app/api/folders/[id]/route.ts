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

  console.info(`[folders/PATCH] Updating folder ${id} for user ${userId}`);

  let body: { name?: string; sortOrder?: number };
  try {
    body = await request.json();
  } catch (err) {
    console.error('[folders/PATCH] Invalid body:', err);
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  // Scope the update via the compound where so we can't touch another
  // user's folder by guessing an id.
  const existing = await prisma.folder.findFirst({
    where: { id, user_id: userId },
    select: { id: true },
  });
  if (existing == null) {
    console.error(`[folders/PATCH] Folder ${id} not found for user ${userId}`);
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const updates: { name?: string; sort_order?: number } = {};
  if (body.name != null) {
    const trimmed = body.name.trim();
    if (trimmed.length === 0 || trimmed.length > 80) {
      console.error(`[folders/PATCH] Invalid folder name length: ${trimmed.length}`);
      return NextResponse.json({ error: 'Invalid folder name' }, { status: 400 });
    }
    updates.name = trimmed;
  }
  if (body.sortOrder != null) {
    if (!Number.isInteger(body.sortOrder)) {
      console.error(`[folders/PATCH] sortOrder must be integer, got: ${body.sortOrder}`);
      return NextResponse.json({ error: 'sortOrder must be an integer' }, { status: 400 });
    }
    updates.sort_order = body.sortOrder;
  }
  if (Object.keys(updates).length === 0) {
    console.error('[folders/PATCH] Nothing to update');
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
  }

  try {
    const row = await prisma.folder.update({
      where: { id },
      data: updates,
      select: { id: true, name: true, sort_order: true },
    });
    return NextResponse.json({ id: row.id, name: row.name, sortOrder: row.sort_order });
  } catch (err) {
    // P2002 = unique constraint violation on (user_id, name). Surface
    // as a friendly 409 when the user tries to rename onto an existing
    // folder name.
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === 'P2002' &&
      updates.name != null
    ) {
      console.error(`[folders/PATCH] Folder name conflict: "${updates.name}"`, err);
      return NextResponse.json(
        { error: `A folder named "${updates.name}" already exists.` },
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

  console.info(`[folders/DELETE] Deleting folder ${id} for user ${userId}`);

  // Scope to the owning user. The SetNull FK on UserSubscription.folder_id
  // means any subscriptions filed under this folder fall back to "Inbox
  // root" rather than getting deleted.
  const result = await prisma.folder.deleteMany({
    where: { id, user_id: userId },
  });
  if (result.count === 0) {
    console.error(`[folders/DELETE] Folder ${id} not found for user ${userId}`);
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  return NextResponse.json({ deleted: true });
}
