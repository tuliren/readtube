import { prisma } from '@readtube/database';
import { NextRequest, NextResponse } from 'next/server';

import { requireUserId } from '@/lib/auth';
import type { InboxQuery, SavedViewData } from '@/lib/types';

function toData(row: {
  id: string;
  name: string;
  query: unknown;
  created_at: Date;
}): SavedViewData {
  return {
    id: row.id,
    name: row.name,
    // The `query` column is JSONB; we round-trip through `as unknown` to
    // satisfy the typechecker — the shape is guaranteed by the create /
    // patch paths below.
    query: (row.query ?? {}) as InboxQuery,
    createdAt: row.created_at.toISOString(),
  };
}

export async function GET() {
  const authResult = await requireUserId();
  if (authResult instanceof NextResponse) {
    return authResult;
  }
  const userId = authResult;

  const rows = await prisma.savedView.findMany({
    where: { user_id: userId },
    orderBy: { created_at: 'desc' },
    select: { id: true, name: true, query: true, created_at: true },
  });

  return NextResponse.json(rows.map(toData));
}

export async function POST(request: NextRequest) {
  const authResult = await requireUserId();
  if (authResult instanceof NextResponse) {
    return authResult;
  }
  const userId = authResult;

  let body: { name?: string; query?: InboxQuery };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  const name = body.name?.trim() ?? '';
  if (name.length === 0 || name.length > 80) {
    return NextResponse.json({ error: 'Invalid name' }, { status: 400 });
  }
  if (body.query == null || typeof body.query !== 'object') {
    return NextResponse.json({ error: 'Missing query' }, { status: 400 });
  }

  const row = await prisma.savedView.create({
    data: {
      user_id: userId,
      name,
      // Prisma's JSON type accepts an object directly.
      query: body.query as unknown as object,
    },
    select: { id: true, name: true, query: true, created_at: true },
  });

  return NextResponse.json(toData(row), { status: 201 });
}
