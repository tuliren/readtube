import { prisma } from '@readtube/database';
import { NextRequest, NextResponse } from 'next/server';

import { requireUserId } from '@/lib/auth';
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
  'remove_from_library',
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
  } catch (err) {
    console.error('[videos/bulk/POST] Invalid body:', err);
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  const videoIds = body.videoIds;
  if (!Array.isArray(videoIds) || videoIds.some((id) => typeof id !== 'string')) {
    console.error('[videos/bulk/POST] videoIds must be a string array');
    return NextResponse.json({ error: 'videoIds must be a string array' }, { status: 400 });
  }
  if (videoIds.length === 0) {
    return NextResponse.json({ affected: 0 });
  }
  if (videoIds.length > 500) {
    console.error(`[videos/bulk/POST] Too many videoIds (${videoIds.length})`);
    return NextResponse.json(
      { error: 'Too many videoIds in one bulk call (max 500)' },
      { status: 400 }
    );
  }

  const action = body.action;
  if (action == null || !VALID_ACTION_TYPES.has(action.type)) {
    console.error(`[videos/bulk/POST] Unknown or missing action: ${action?.type}`);
    return NextResponse.json({ error: 'Unknown or missing action' }, { status: 400 });
  }

  console.info(
    `[videos/bulk/POST] Applying ${action.type} to ${videoIds.length} videos for user ${userId}`
  );

  const result = await applyBulk(prisma, userId, videoIds, action);
  return NextResponse.json(result);
}
