import { auth } from '@clerk/nextjs/server';
import { prisma } from '@readtube/database';
import { NextRequest, NextResponse } from 'next/server';
import { getRun, start } from 'workflow/api';

import { MANUAL_REFRESH_DAYS, canManuallyRefresh } from '@/lib/channels/staleness';
import { isProduction } from '@/lib/vercelEnv';
import { refreshSingleChannelWorkflow } from '@/lib/workflows/refresh-channels';
import {
  claimChannelRefresh,
  findActiveChannelRefresh,
  releaseChannelRefresh,
} from '@/lib/workflows/runRegistry';

/**
 * POST /api/channels/[id]/refresh
 *
 * User-triggered single-channel refresh. Kicks off the same workflow
 * the cron uses (scoped to one channel), waits for it to finish, then
 * returns the result so the client can reload and pull the updated
 * data from the DB.
 *
 * Two layers of throttling:
 *   1. `canManuallyRefresh(checked_at)` — the same cooldown the
 *      header button uses for its disabled state, repeated here so a
 *      direct API call can't bypass the UI gate and hammer the
 *      upstream scrape.
 *   2. `findActiveChannelRefresh` + `claimChannelRefresh` — exclusive
 *      claim that returns 429 when another refresh workflow (manual
 *      or cron) is currently working on the same row. Stale
 *      REFRESHING markers are recovered by `findActiveChannelRefresh`.
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
  // Cooldown only applies in production — preview + local dev should
  // refresh on demand. The exclusive-claim check below still guards
  // against concurrent refresh storms regardless of environment.
  if (isProduction() && !canManuallyRefresh(sub.channel.checked_at)) {
    console.error(`[channels/refresh] Channel ${channelId} refreshed too recently`);
    return NextResponse.json(
      {
        error: `Refreshed recently. Try again after ${MANUAL_REFRESH_DAYS} day${MANUAL_REFRESH_DAYS === 1 ? '' : 's'}.`,
      },
      { status: 429 }
    );
  }

  // Dedup: another refresh workflow may already be running. Recovers
  // a stale REFRESHING marker (workflow died without flipping back).
  const active = await findActiveChannelRefresh(prisma, channelId);
  if (active != null) {
    console.info(
      `[channels/refresh] Channel ${channelId} already being refreshed by run ${active.runId}`
    );
    return NextResponse.json({ error: 'Refresh already in progress.' }, { status: 429 });
  }

  // Start the workflow first so we have a real runId to record on
  // the row. If a concurrent caller wins the claim race, we cancel
  // our run before it does any meaningful work.
  const run = await start(refreshSingleChannelWorkflow, [channelId]);
  const claimed = await claimChannelRefresh(prisma, channelId, run.runId);
  if (!claimed) {
    console.info(
      `[channels/refresh] Lost claim race for ${channelId}; cancelling run ${run.runId}`
    );
    try {
      await getRun(run.runId).cancel();
    } catch (err) {
      console.error(`[channels/refresh] Failed to cancel run ${run.runId}:`, err);
    }
    return NextResponse.json({ error: 'Refresh already in progress.' }, { status: 429 });
  }

  try {
    const result = await run.returnValue;
    await releaseChannelRefresh(prisma, channelId, run.runId);
    if (result == null) {
      console.error(`[channels/refresh] Workflow returned null for ${channelId}`);
      return NextResponse.json({ error: 'Channel not found' }, { status: 404 });
    }
    return NextResponse.json(result);
  } catch (err) {
    await releaseChannelRefresh(prisma, channelId, run.runId);
    console.error(`[channels/refresh] workflow failed for ${channelId}:`, err);
    return NextResponse.json(
      { error: 'Failed to refresh channel. Check the console for details.' },
      { status: 500 }
    );
  }
}
