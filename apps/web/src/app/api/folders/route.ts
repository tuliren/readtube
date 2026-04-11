import { prisma } from '@readtube/database';
import { NextRequest, NextResponse } from 'next/server';

import { requireUserId } from '@/lib/auth';
import type { FolderData } from '@/lib/types';

function toFolderData(row: { id: string; name: string; sort_order: number }): FolderData {
  return { id: row.id, name: row.name, sortOrder: row.sort_order };
}

export async function GET() {
  const authResult = await requireUserId();
  if (authResult instanceof NextResponse) {
    return authResult;
  }
  const userId = authResult;

  const rows = await prisma.folder.findMany({
    where: { user_id: userId },
    orderBy: [{ sort_order: 'asc' }, { name: 'asc' }],
    select: { id: true, name: true, sort_order: true },
  });

  return NextResponse.json(rows.map(toFolderData));
}

export async function POST(request: NextRequest) {
  const authResult = await requireUserId();
  if (authResult instanceof NextResponse) {
    return authResult;
  }
  const userId = authResult;

  let body: { name?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }
  const name = body.name?.trim() ?? '';
  if (name.length === 0) {
    return NextResponse.json({ error: 'Folder name required' }, { status: 400 });
  }
  if (name.length > 80) {
    return NextResponse.json({ error: 'Folder name too long' }, { status: 400 });
  }

  // Append at the end of the list so new folders don't disturb existing order.
  const max = await prisma.folder.aggregate({
    where: { user_id: userId },
    _max: { sort_order: true },
  });
  const nextOrder = (max._max.sort_order ?? -1) + 1;

  const row = await prisma.folder.create({
    data: { user_id: userId, name, sort_order: nextOrder },
    select: { id: true, name: true, sort_order: true },
  });

  return NextResponse.json(toFolderData(row), { status: 201 });
}
