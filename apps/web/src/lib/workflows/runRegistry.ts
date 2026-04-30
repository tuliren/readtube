import { type ArticleStyle, GenerationKind, Prisma, type PrismaClient } from '@readtube/database';
import { getRun } from 'workflow/api';

/**
 * Reads and writes against the `GenerationRun` table — the registry
 * of in-flight summary/article workflow runs that lets a second
 * client (or the same client after a refresh) tap into an existing
 * stream instead of starting a duplicate generation.
 *
 * The lifecycle a row goes through:
 *
 * 1. **Claim**: route POST calls workflow `start()`, then
 *    {@link claimSummaryRun} / {@link claimArticleRun} to insert a
 *    row keyed on the (transcript, kind, language[, style]) slot.
 *    A unique index on the slot enforces "at most one active
 *    workflow"; the loser of a concurrent claim cancels its own
 *    `start()` and reuses the winner's run.
 *
 * 2. **Read**: route GET (and route POST for the existing-stream
 *    short-circuit) calls {@link findActiveSummaryRun} /
 *    {@link findActiveArticleRun} to look up the slot. If the row
 *    exists AND the workflow is still alive (`pending`/`running`),
 *    the route returns its readable. Stale rows (workflow already
 *    finished, failed, expired, or got cancelled outside our
 *    control) are best-effort deleted on the read path so future
 *    requests don't keep tapping into a dead run.
 *
 * 3. **Clear**: the workflow's persist step (the only step that
 *    touches the DB and runs after generation succeeds) calls
 *    {@link clearRunBySlot} after its upsert, atomically freeing
 *    the slot for a future regenerate request. The slot key matches
 *    the workflow's input (transcript, kind, language[, style]), so
 *    the cleanup doesn't need to thread the runId — useful because
 *    the workflow function doesn't have easy access to its own
 *    runId.
 */

interface ActiveRun {
  runId: string;
}

// WorkflowRunStatus values that indicate the workflow is still doing
// something — `pending` (queued) and `running` (executing). Any other
// status (`completed`, `failed`, `cancelled`, `expired`) means tapping
// into this run would yield nothing useful, so callers treat it as
// "no active run" and proceed as if the slot were free.
async function isWorkflowActive(runId: string): Promise<boolean> {
  try {
    const status = await getRun(runId).status;
    return status === 'pending' || status === 'running';
  } catch {
    // getRun().status throws if the runId can't be resolved — treat
    // that the same as "not active" so the caller falls back to the
    // start-fresh path instead of bubbling up a 500.
    return false;
  }
}

async function deleteRunRow(prisma: PrismaClient, id: string): Promise<void> {
  // Best-effort. Cleanup races (a second reader noticing the same
  // staleness) resolve to no-ops via the where clause; we don't want
  // a transient DB hiccup here to break the read path.
  try {
    await prisma.generationRun.delete({ where: { id } });
  } catch {
    // ignore
  }
}

export async function findActiveSummaryRun(
  prisma: PrismaClient,
  transcriptId: string,
  language: string | null
): Promise<ActiveRun | null> {
  const row = await prisma.generationRun.findFirst({
    where: {
      transcript_id: transcriptId,
      kind: GenerationKind.SUMMARY,
      language,
      style: null,
    },
  });
  if (row == null) {
    return null;
  }
  if (await isWorkflowActive(row.run_id)) {
    return { runId: row.run_id };
  }
  await deleteRunRow(prisma, row.id);
  return null;
}

export async function findActiveArticleRun(
  prisma: PrismaClient,
  transcriptId: string,
  style: ArticleStyle,
  language: string | null
): Promise<ActiveRun | null> {
  const row = await prisma.generationRun.findFirst({
    where: {
      transcript_id: transcriptId,
      kind: GenerationKind.ARTICLE,
      language,
      style,
    },
  });
  if (row == null) {
    return null;
  }
  if (await isWorkflowActive(row.run_id)) {
    return { runId: row.run_id };
  }
  await deleteRunRow(prisma, row.id);
  return null;
}

interface ClaimResult {
  /** The runId whose stream callers should subscribe to. May be the
   *  one we passed in (we won), or another concurrent claimant's
   *  (we lost; cancel ours). */
  winningRunId: string;
  /** True if our `newRunId` won the slot. False means a concurrent
   *  claimant got there first and the caller should
   *  `getRun(newRunId).cancel()` to free up our wasted workflow. */
  weWon: boolean;
}

async function tryClaim(
  prisma: PrismaClient,
  data: {
    transcript_id: string;
    kind: GenerationKind;
    language: string | null;
    style: ArticleStyle | null;
    run_id: string;
  }
): Promise<ClaimResult> {
  try {
    await prisma.generationRun.create({ data });
    return { winningRunId: data.run_id, weWon: true };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      const winner = await prisma.generationRun.findFirst({
        where: {
          transcript_id: data.transcript_id,
          kind: data.kind,
          language: data.language,
          style: data.style,
        },
      });
      if (winner != null) {
        return { winningRunId: winner.run_id, weWon: false };
      }
      // Constraint says someone has it but we can't find them — likely
      // a concurrent clear between INSERT and SELECT. Fall back to
      // "we won" so the caller proceeds with their fresh run; if the
      // other claimant retries it'll lose now and tap into us.
      return { winningRunId: data.run_id, weWon: true };
    }
    throw err;
  }
}

export async function claimSummaryRun(
  prisma: PrismaClient,
  transcriptId: string,
  language: string | null,
  newRunId: string
): Promise<ClaimResult> {
  return tryClaim(prisma, {
    transcript_id: transcriptId,
    kind: GenerationKind.SUMMARY,
    language,
    style: null,
    run_id: newRunId,
  });
}

export async function claimArticleRun(
  prisma: PrismaClient,
  transcriptId: string,
  style: ArticleStyle,
  language: string | null,
  newRunId: string
): Promise<ClaimResult> {
  return tryClaim(prisma, {
    transcript_id: transcriptId,
    kind: GenerationKind.ARTICLE,
    language,
    style,
    run_id: newRunId,
  });
}

/**
 * Clear the run-registry slot identified by its key. Called by the
 * workflow's persist step after a successful upsert so the slot
 * frees the moment the row lands in the database.
 *
 * Slot-keyed rather than runId-keyed because the workflow function
 * doesn't have easy access to its own runId, and using the key is
 * idempotent — a stale-cleanup pass that happens to run concurrently
 * just no-ops on the second writer.
 */
export async function clearSummaryRunSlot(
  prisma: PrismaClient,
  transcriptId: string,
  language: string | null
): Promise<void> {
  await prisma.generationRun.deleteMany({
    where: {
      transcript_id: transcriptId,
      kind: GenerationKind.SUMMARY,
      language,
      style: null,
    },
  });
}

export async function clearArticleRunSlot(
  prisma: PrismaClient,
  transcriptId: string,
  style: ArticleStyle,
  language: string | null
): Promise<void> {
  await prisma.generationRun.deleteMany({
    where: {
      transcript_id: transcriptId,
      kind: GenerationKind.ARTICLE,
      language,
      style,
    },
  });
}
