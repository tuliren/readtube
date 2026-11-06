import { prisma } from '@readtube/database';
import { NextRequest, NextResponse } from 'next/server';

import { requireUserId } from '@/lib/auth';
import { ensureUserExists } from '@/lib/db/user';
import { applyOnboardingSelection, parseOnboardingSelection } from '@/lib/onboarding/apply';

/**
 * Apply the new-user onboarding picks: follow the selected channels and
 * add the selected videos to the library, in one request.
 *
 * Body: `{ channelIds: string[], videoIds: string[] }` (ids from the
 * onboarding page's suggestions). Ineligible ids are skipped; the
 * response counts what was actually added.
 */
export async function POST(request: NextRequest) {
  const authResult = await requireUserId();
  if (authResult instanceof NextResponse) {
    return authResult;
  }
  const userId = authResult;

  let body: unknown;
  try {
    body = await request.json();
  } catch (err) {
    console.error('[onboarding/POST] Invalid request body:', err);
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const selection = parseOnboardingSelection(body);
  if (selection == null) {
    console.error('[onboarding/POST] Invalid selection');
    return NextResponse.json({ error: 'Pick at least one channel or video.' }, { status: 400 });
  }

  console.info(
    `[onboarding/POST] User ${userId} picked ${selection.channelIds.length} channels and ${selection.videoIds.length} videos`
  );

  await ensureUserExists(userId);
  const result = await applyOnboardingSelection(prisma, userId, selection);

  console.info(`[onboarding/POST] Applied for user ${userId}`, result);
  return NextResponse.json(result);
}
