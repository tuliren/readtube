import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

/**
 * Server-side Clerk auth wrapper that returns a 401 JSON response when the
 * caller is not signed in, and otherwise returns the Clerk user id. Keeps
 * every API route honest about auth with one line:
 *
 * ```ts
 * const auth = await requireUserId();
 * if (auth instanceof NextResponse) { return auth; }
 * const userId = auth;
 * ```
 *
 * We return the response directly (rather than throwing) so routes stay
 * explicit about their error shapes and don't need try/catch for this case.
 */
export async function requireUserId(): Promise<string | NextResponse> {
  const { userId } = await auth();
  if (userId == null) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return userId;
}
