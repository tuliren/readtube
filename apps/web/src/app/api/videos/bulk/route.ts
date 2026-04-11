import { NextRequest, NextResponse } from 'next/server';

import { requireUserId } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { type BulkAction, applyBulk } from '@/lib/inbox/triageActions';

interface Body {
  videoIds?: string[];
  action?: BulkAction;
}

const VALID_ACTION_TYPES = new Set([
  'mark_read',
  'star',
  'unstar',
  'save',
  'unsave',
  'archive',
  'unarchive',
  'snooze',
]);

export async function POST(request: NextRequest) {
  const authResult = await requireUserId();
  if (authResult instanceof NextResponse) {
    return authResult;
  }
  const userId = authResult;

  let body: Body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  const videoIds = body.videoIds;
  if (!Array.isArray(videoIds) || videoIds.some((id) => typeof id !== 'string')) {
    return NextResponse.json({ error: 'videoIds must be a string array' }, { status: 400 });
  }
  if (videoIds.length === 0) {
    return NextResponse.json({ affected: 0 });
  }
  if (videoIds.length > 500) {
    return NextResponse.json(
      { error: 'Too many videoIds in one bulk call (max 500)' },
      { status: 400 }
    );
  }

  const action = body.action;
  if (action == null || !VALID_ACTION_TYPES.has(action.type)) {
    return NextResponse.json({ error: 'Unknown or missing action' }, { status: 400 });
  }
  if (action.type === 'snooze') {
    const until = new Date(action.snoozeUntil);
    if (Number.isNaN(until.getTime()) || until.getTime() <= Date.now()) {
      return NextResponse.json(
        { error: 'snoozeUntil must be a valid future ISO datetime' },
        { status: 400 }
      );
    }
  }

  const result = await applyBulk(prisma, userId, videoIds, action);
  return NextResponse.json(result);
}
