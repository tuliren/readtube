import type { PrismaClient } from '@readtube/database';
import { getRun } from 'workflow/api';

import type { ClaimResult } from '@/lib/workflows/runRegistry';

/**
 * Start a summary / article workflow with no client waiting on its
 * stream (auto-summary after transcript generation, English
 * follow-ups), then claim its registry slot.
 *
 * Mirrors the routes' start → claim dance without the stream
 * response: on a lost claim race the stray run is cancelled and its
 * pending `UserRequest` deleted (no LLM cost is incurred); on a win
 * the run id is stamped on the `UserRequest`. Audit failures are
 * logged, never thrown.
 *
 * Returns the run id when we own the slot, null on a lost race.
 */
export async function startBackgroundRun(
  prisma: PrismaClient,
  params: {
    logPrefix: string;
    userRequest: { id: string } | null;
    start: () => Promise<{ runId: string }>;
    claim: (runId: string) => Promise<ClaimResult>;
  }
): Promise<string | null> {
  const { logPrefix, userRequest } = params;
  const run = await params.start();
  const claim = await params.claim(run.runId);

  if (!claim.weWon) {
    console.info(`${logPrefix} Lost claim race; cancelling ${run.runId}`);
    try {
      await getRun(run.runId).cancel();
    } catch {
      // ignore — the stray run will expire on its own
    }
    if (userRequest != null) {
      try {
        await prisma.userRequest.delete({ where: { id: userRequest.id } });
      } catch (err) {
        console.error(`${logPrefix} failed to delete claim-race UserRequest:`, err);
      }
    }
    return null;
  }

  if (userRequest != null) {
    try {
      await prisma.userRequest.update({
        where: { id: userRequest.id },
        data: { workflow_id: run.runId },
      });
    } catch (err) {
      console.error(`${logPrefix} failed to stamp workflow_id on UserRequest:`, err);
    }
  }
  return run.runId;
}
