import { Prisma, prisma } from '@readtube/database';
import { NextRequest, NextResponse } from 'next/server';

import { requireUserId } from '@/lib/auth';

export interface PlaylistData {
  id: string;
  name: string;
  sortOrder: number;
  videoCount: number;
}

function toPlaylistData(row: {
  id: string;
  name: string;
  sort_order: number;
  _count: { items: number };
}): PlaylistData {
  return {
    id: row.id,
    name: row.name,
    sortOrder: row.sort_order,
    videoCount: row._count.items,
  };
}

export async function GET() {
  const authResult = await requireUserId();
  if (authResult instanceof NextResponse) {
    return authResult;
  }
  const userId = authResult;

  const rows = await prisma.playlist.findMany({
    where: { user_id: userId },
    orderBy: [{ sort_order: 'asc' }, { name: 'asc' }],
    select: {
      id: true,
      name: true,
      sort_order: true,
      _count: { select: { items: true } },
    },
  });

  return NextResponse.json(rows.map(toPlaylistData));
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
    return NextResponse.json({ error: 'Playlist name required' }, { status: 400 });
  }
  if (name.length > 80) {
    return NextResponse.json({ error: 'Playlist name too long' }, { status: 400 });
  }

  const max = await prisma.playlist.aggregate({
    where: { user_id: userId },
    _max: { sort_order: true },
  });
  const nextOrder = (max._max.sort_order ?? -1) + 1;

  try {
    const row = await prisma.playlist.create({
      data: { user_id: userId, name, sort_order: nextOrder },
      select: {
        id: true,
        name: true,
        sort_order: true,
        _count: { select: { items: true } },
      },
    });
    return NextResponse.json(toPlaylistData(row), { status: 201 });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return NextResponse.json(
        { error: `A playlist named "${name}" already exists.` },
        { status: 409 }
      );
    }
    throw err;
  }
}
