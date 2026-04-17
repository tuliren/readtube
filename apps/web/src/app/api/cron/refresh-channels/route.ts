import { NextRequest, NextResponse } from 'next/server';
import { start } from 'workflow/api';

import { verifyCronRequest } from '@/lib/cron';
import { refreshChannelsWorkflow } from '@/lib/workflows/refresh-channels';

export async function GET(request: NextRequest) {
  if (!verifyCronRequest(request)) {
    console.error('[cron/refresh-channels/GET] Unauthorized cron request');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  console.info('[cron/refresh-channels/GET] Starting refresh-channels workflow');

  const run = await start(refreshChannelsWorkflow);

  return NextResponse.json({ runId: run.runId, status: run.status });
}
