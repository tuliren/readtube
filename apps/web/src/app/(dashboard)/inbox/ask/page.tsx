import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';

import AskInboxChat from '@/components/reader/AskInboxChat';

/**
 * Ask-my-inbox chat surface. Matches the auth pattern used by every
 * other page in the `(dashboard)` route group — the layout deliberately
 * doesn't redirect unauthenticated users (so /videos/[videoId] can
 * send them to the public mirror), so each page guards itself.
 */
export default async function AskInboxPage() {
  const { userId } = await auth();
  if (userId == null) {
    redirect('/');
  }
  return <AskInboxChat />;
}
