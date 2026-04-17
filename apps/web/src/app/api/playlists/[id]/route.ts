import { Prisma, prisma } from '@readtube/database';
import { NextRequest, NextResponse } from 'next/server';

import { requireUserId } from '@/lib/auth';
import { deletePlaylistForUser } from '@/lib/workflows/delete-playlist';

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

  console.info(`[playlists/PATCH] Updating playlist ${id} for user ${userId}`);

  let body: { customName?: string | null; sortOrder?: number };
  try {
    body = await request.json();
  } catch (err) {
    console.error('[playlists/PATCH] Invalid body:', err);
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  const existing = await prisma.playlist.findFirst({
    where: { id, user_id: userId },
    select: { id: true },
  });
  if (existing == null) {
    console.error(`[playlists/PATCH] Playlist ${id} not found for user ${userId}`);
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // Only `customName` and `sortOrder` are editable. `name` is the
  // immutable source-provided title; callers that want to change what
  // the UI displays set `customName`. Passing null clears the override.
  const updates: { custom_name?: string | null; sort_order?: number } = {};
  if ('customName' in body) {
    if (body.customName === null) {
      updates.custom_name = null;
    } else if (typeof body.customName === 'string') {
      const trimmed = body.customName.trim();
      if (trimmed.length === 0) {
        updates.custom_name = null;
      } else if (trimmed.length > 80) {
        console.error(`[playlists/PATCH] Custom name too long (${trimmed.length})`);
        return NextResponse.json({ error: 'Custom name too long' }, { status: 400 });
      } else {
        updates.custom_name = trimmed;
      }
    }
  }
  if (body.sortOrder != null) {
    if (!Number.isInteger(body.sortOrder)) {
      console.error(`[playlists/PATCH] sortOrder must be integer, got: ${body.sortOrder}`);
      return NextResponse.json({ error: 'sortOrder must be an integer' }, { status: 400 });
    }
    updates.sort_order = body.sortOrder;
  }
  if (Object.keys(updates).length === 0) {
    console.error('[playlists/PATCH] Nothing to update');
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
  }

  try {
    const row = await prisma.playlist.update({
      where: { id },
      data: updates,
      select: { id: true, name: true, custom_name: true, sort_order: true },
    });
    return NextResponse.json({
      id: row.id,
      name: row.name,
      customName: row.custom_name,
      sortOrder: row.sort_order,
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      console.error(`[playlists/PATCH] Unique constraint conflict updating playlist ${id}:`, err);
      return NextResponse.json({ error: 'A conflicting value already exists.' }, { status: 409 });
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

  console.info(`[playlists/DELETE] Deleting playlist ${id} for user ${userId}`);

  const result = await deletePlaylistForUser(prisma, userId, id);
  if (!result.deleted) {
    console.error(`[playlists/DELETE] Playlist ${id} not found for user ${userId}`);
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  return NextResponse.json({ deleted: true });
}
