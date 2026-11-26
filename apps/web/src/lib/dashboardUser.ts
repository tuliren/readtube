import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { cache } from 'react';

import { ensureUserExists } from '@/lib/db/user';

/**
 * One `ensureUserExists` per request, shared by the dashboard layout,
 * the page, and `generateMetadata`.
 */
const ensureUserExistsOnce = cache(ensureUserExists);

/**
 * The signed-in Clerk user id for a dashboard server component, once the
 * user's row is in place. Redirects home when signed out.
 *
 * Every dashboard layout, page, and `generateMetadata` that reads user
 * data must get its user id here rather than from `auth()` directly.
 * Next renders a layout and its page in parallel, so a page can't rely
 * on the layout having run `ensureUserExists` first. Outside production
 * that call can rewrite `User.source_id` (adopting a row forked from
 * production data), and a page that queried before the rewrite landed
 * would see an account with nothing in it: the inbox would show the
 * new-user onboarding to a user who follows plenty of channels.
 */
export async function requireDashboardUserId(): Promise<string> {
  const { userId } = await auth();
  if (userId == null) {
    redirect('/');
  }
  await ensureUserExistsOnce(userId);
  return userId;
}
