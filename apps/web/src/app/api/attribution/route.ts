import { currentUser } from '@clerk/nextjs/server';
import { Prisma, prisma } from '@readtube/database';
import { NextRequest, NextResponse } from 'next/server';

import {
  SignupAttributionResponse,
  isWithinSignupAttributionWindow,
  sanitizeAttributionInput,
} from '@/lib/analytics/signupAttribution';
import { ensureUserExists } from '@/lib/db/user';

/**
 * Record first-touch signup attribution for the signed-in user.
 *
 * Body: the UTM params / referrer / landing page captured client-side
 * (see `lib/analytics/utmParams.ts`). Only whitelisted fields are kept,
 * values are truncated, and excluded referrers are re-dropped server-side.
 *
 * One row per user: only accounts younger than the attribution window
 * are recorded, an existing row is never overwritten, and the unique
 * constraint on user_id decides the winner when two concurrent
 * submissions (e.g. two open tabs) race. Every non-error status tells
 * the client the submission was handled and it can stop retrying.
 */
export async function POST(request: NextRequest) {
  // currentUser() instead of auth(): the attribution window check needs the
  // account's createdAt, which the session token doesn't carry. This route
  // runs at most a handful of times per user, so the extra Clerk API call
  // is fine.
  const user = await currentUser();
  if (user == null) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: unknown = null;
  try {
    body = await request.json();
  } catch {
    // Fall through with an empty body; sanitization returns {}.
  }

  const attribution = sanitizeAttributionInput(body, request.nextUrl.hostname);
  if (Object.keys(attribution).length === 0) {
    const response: SignupAttributionResponse = { status: 'empty' };
    return NextResponse.json(response);
  }

  if (!isWithinSignupAttributionWindow(new Date(user.createdAt), new Date())) {
    const response: SignupAttributionResponse = { status: 'not_new_user' };
    return NextResponse.json(response);
  }

  // The Clerk webhook that creates the User row may not have landed yet for
  // a brand-new signup; the FK on SignupAttribution.user_id needs it.
  await ensureUserExists(user.id);

  const existing = await prisma.signupAttribution.findUnique({
    where: { user_id: user.id },
    select: { id: true },
  });
  if (existing != null) {
    const response: SignupAttributionResponse = { status: 'already_recorded' };
    return NextResponse.json(response);
  }

  try {
    await prisma.signupAttribution.create({
      data: { user_id: user.id, ...attribution },
    });
  } catch (err) {
    // P2002 = unique constraint violation on user_id: another submission won
    // the race between the pre-check above and this insert.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      const response: SignupAttributionResponse = { status: 'already_recorded' };
      return NextResponse.json(response);
    }
    throw err;
  }
  console.info(`Recorded signup attribution for user ${user.id}`, attribution);

  const response: SignupAttributionResponse = { status: 'recorded' };
  return NextResponse.json(response);
}
