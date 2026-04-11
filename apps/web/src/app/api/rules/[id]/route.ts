import { NextRequest, NextResponse } from 'next/server';

import { requireUserId } from '@/lib/auth';
import { prisma } from '@/lib/db';
import type { RuleAction, RuleCondition } from '@/lib/rules/evaluate';

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

  const existing = await prisma.rule.findFirst({
    where: { id, user_id: userId },
    select: { id: true },
  });
  if (existing == null) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const updates: {
    name?: string;
    enabled?: boolean;
    conditions?: object;
    actions?: object;
  } = {};

  if (body.name != null) {
    const name = body.name.trim();
    if (name.length === 0 || name.length > 120) {
      return NextResponse.json({ error: 'Invalid name' }, { status: 400 });
    }
    updates.name = name;
  }
  if (body.enabled != null) {
    updates.enabled = body.enabled;
  }
  if (body.conditions != null) {
    if (!Array.isArray(body.conditions) || body.conditions.length === 0) {
      return NextResponse.json({ error: 'At least one condition required' }, { status: 400 });
    }
    updates.conditions = body.conditions as unknown as object;
  }
  if (body.actions != null) {
    if (!Array.isArray(body.actions) || body.actions.length === 0) {
      return NextResponse.json({ error: 'At least one action required' }, { status: 400 });
    }
    updates.actions = body.actions as unknown as object;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
  }

  await prisma.rule.update({
    where: { id },
    data: updates,
  });

  return NextResponse.json({ updated: true });
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  const authResult = await requireUserId();
  if (authResult instanceof NextResponse) {
    return authResult;
  }
  const userId = authResult;
  const { id } = await params;

  const result = await prisma.rule.deleteMany({
    where: { id, user_id: userId },
  });
  if (result.count === 0) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  return NextResponse.json({ deleted: true });
}
