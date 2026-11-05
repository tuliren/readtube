import type { PrismaClient } from '@readtube/database';
import { getRun } from 'workflow/api';

import type { ClaimResult } from '@/lib/workflows/runRegistry';

/**
 * Start a summary / article workflow, then claim its registry slot so
 * later GETs and Generate clicks tap into it. Shared by the summary /
 * article POST routes, the auto-summary after transcript generation,
 * and the English follow-ups.
 *
 * On a lost claim race the stray run is cancelled and its pending
 * `UserRequest` deleted (no LLM cost is incurred); the caller streams
 * `winningRunId` instead. On a win the run id is stamped on the
 * `UserRequest`. Audit failures are logged, never thrown.
 */
export async function startAndClaimRun(
  prisma: PrismaClient,
  params: {
    logPrefix: string;
    userRequest: { id: string } | null;
    start: () => Promise<{ runId: string }>;
    claim: (runId: string) => Promise<ClaimResult>;
  }
): Promise<ClaimResult> {
  const { logPrefix, userRequest } = params;
  const run = await params.start();
  const claim = await params.claim(run.runId);

  if (!claim.weWon) {
    console.info(
      `${logPrefix} Lost claim race; cancelling ${run.runId} in favor of ${claim.winningRunId}`
    );
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
    return claim;
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
  return claim;
}
