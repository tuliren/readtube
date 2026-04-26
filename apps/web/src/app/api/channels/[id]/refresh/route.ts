import { auth } from '@clerk/nextjs/server';
import { prisma } from '@readtube/database';
import { NextRequest, NextResponse } from 'next/server';
import { start } from 'workflow/api';

import { MANUAL_REFRESH_DAYS, canManuallyRefresh } from '@/lib/channels/staleness';
import { refreshSingleChannelWorkflow } from '@/lib/workflows/refresh-channels';

/**
 * POST /api/channels/[id]/refresh
 *
 * User-triggered single-channel refresh. Kicks off the same workflow
 * the cron uses (scoped to one channel), waits for it to finish, then
 * returns the result so the client can reload and pull the updated
 * data from the DB.
 *
 * Throttled by `canManuallyRefresh` — the same cooldown the header
 * button uses for its disabled state, repeated here so a direct API
 * call can't bypass the UI gate and hammer the upstream scrape.
 */
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (userId == null) {
    console.error('[channels/refresh] Unauthorized');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id: channelId } = await params;

  console.info(`[channels/refresh] Refreshing channel ${channelId} for user ${userId}`);

  // IDOR check + cooldown read: a single query covers both the
  // subscription guard and the `checked_at` we need for the throttle.
  const sub = await prisma.userSubscription.findFirst({
    where: { user_id: userId, channel_id: channelId },
    select: { channel: { select: { checked_at: true } } },
  });
  if (sub == null) {
    console.error(`[channels/refresh] Channel ${channelId} not subscribed by user ${userId}`);
    return NextResponse.json({ error: 'Channel not found' }, { status: 404 });
  }
  if (!canManuallyRefresh(sub.channel.checked_at)) {
    console.error(`[channels/refresh] Channel ${channelId} refreshed too recently`);
    return NextResponse.json(
      { error: `Refreshed recently. Try again after ${MANUAL_REFRESH_DAYS} day${MANUAL_REFRESH_DAYS === 1 ? '' : 's'}.` },
      { status: 429 }
    );
  }

  try {
    const run = await start(refreshSingleChannelWorkflow, [channelId]);
    const result = await run.returnValue;
    if (result == null) {
      console.error(`[channels/refresh] Workflow returned null for ${channelId}`);
      return NextResponse.json({ error: 'Channel not found' }, { status: 404 });
    }
    return NextResponse.json(result);
  } catch (err) {
    console.error(`[channels/refresh] workflow failed for ${channelId}:`, err);
    return NextResponse.json(
      { error: 'Failed to refresh channel. Check the console for details.' },
      { status: 500 }
    );
  }
}
