import { NextRequest, NextResponse } from 'next/server';

import { requireUserId } from '@/lib/auth';
import { prisma } from '@/lib/db';
import type { RuleAction, RuleCondition } from '@/lib/rules/evaluate';

interface RuleData {
  id: string;
  name: string;
  enabled: boolean;
  conditions: RuleCondition[];
  actions: RuleAction[];
  createdAt: string;
  updatedAt: string;
}

function toData(row: {
  id: string;
  name: string;
  enabled: boolean;
  conditions: unknown;
  actions: unknown;
  created_at: Date;
  updated_at: Date;
}): RuleData {
  return {
    id: row.id,
    name: row.name,
    enabled: row.enabled,
    conditions: (row.conditions ?? []) as unknown as RuleCondition[],
    actions: (row.actions ?? []) as unknown as RuleAction[],
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export async function GET() {
  const authResult = await requireUserId();
  if (authResult instanceof NextResponse) {
    return authResult;
  }
  const userId = authResult;

  const rows = await prisma.rule.findMany({
    where: { user_id: userId },
    orderBy: { created_at: 'desc' },
    select: {
      id: true,
      name: true,
      enabled: true,
      conditions: true,
      actions: true,
      created_at: true,
      updated_at: true,
    },
  });

  return NextResponse.json(rows.map(toData));
}

export async function POST(request: NextRequest) {
  const authResult = await requireUserId();
  if (authResult instanceof NextResponse) {
    return authResult;
  }
  const userId = authResult;

  let body: {
    name?: string;
    enabled?: boolean;
    conditions?: RuleCondition[];
    actions?: RuleAction[];
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  const name = body.name?.trim() ?? '';
  if (name.length === 0 || name.length > 120) {
    return NextResponse.json({ error: 'Invalid name' }, { status: 400 });
  }
  if (!Array.isArray(body.conditions) || body.conditions.length === 0) {
    return NextResponse.json({ error: 'At least one condition required' }, { status: 400 });
  }
  if (!Array.isArray(body.actions) || body.actions.length === 0) {
    return NextResponse.json({ error: 'At least one action required' }, { status: 400 });
  }

  const row = await prisma.rule.create({
    data: {
      user_id: userId,
      name,
      enabled: body.enabled ?? true,
      conditions: body.conditions as unknown as object,
      actions: body.actions as unknown as object,
    },
    select: {
      id: true,
      name: true,
      enabled: true,
      conditions: true,
      actions: true,
      created_at: true,
      updated_at: true,
    },
  });

  return NextResponse.json(toData(row), { status: 201 });
}
