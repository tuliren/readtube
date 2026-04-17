import { auth } from '@clerk/nextjs/server';
import { prisma } from '@readtube/database';
import { NextRequest, NextResponse } from 'next/server';
import { start } from 'workflow/api';

import { VercelEnv, getVercelEnv } from '@/lib/vercelEnv';
import { refreshSingleChannelWorkflow } from '@/lib/workflows/refresh-channels';

/**
 * POST /api/channels/[id]/refresh
 *
 * Dev-only single-channel refresh. Kicks off the same workflow the
 * cron uses (scoped to one channel), waits for it to finish, then
 * returns the result so the client can reload and pull the updated
 * data from the DB.
 *
 * Gated on both server-side env check (rejects in production) and
 * client-side UI hiding (the Refresh button uses `isProduction()`).
 */
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (getVercelEnv(process.env.VERCEL_ENV) === VercelEnv.PRODUCTION) {
    console.error('[channels/refresh] Attempted refresh in production');
    return NextResponse.json({ error: 'Not available in production' }, { status: 403 });
  }

  const { userId } = await auth();
  if (userId == null) {
    console.error('[channels/refresh] Unauthorized');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id: channelId } = await params;

  console.info(`[channels/refresh] Refreshing channel ${channelId} for user ${userId}`);

  // IDOR check: the user must be subscribed to this channel.
  const sub = await prisma.userSubscription.findFirst({
    where: { user_id: userId, channel_id: channelId },
    select: { channel_id: true },
  });
  if (sub == null) {
    console.error(`[channels/refresh] Channel ${channelId} not subscribed by user ${userId}`);
    return NextResponse.json({ error: 'Channel not found' }, { status: 404 });
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
