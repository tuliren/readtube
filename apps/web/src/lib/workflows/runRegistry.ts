import {
  type ArticleStyle,
  ChannelStatus,
  GenerationStatus,
  Prisma,
  type PrismaClient,
} from '@readtube/database';
import { getRun } from 'workflow/api';

/**
 * Reads and writes the in-flight workflow markers on `Summary` and
 * `Article` rows themselves. The merged "registry-on-the-row" design:
 *
 *   - `status = GENERATING` + `workflow_id = <runId>` ⇒ a workflow is
 *     currently writing into this row. A second client (or the same
 *     client after a refresh) calls `findActiveSummaryRun` /
 *     `findActiveArticleRun`, gets the runId, and pipes
 *     `getRun(runId).getReadable({ startIndex: 0 })` back to the
 *     client.
 *
 *   - `status = READY` ⇒ canonical cached content. workflow_id, when
 *     set, points at the run that produced the current row (handy
 *     for tracing / audit, never used for tap-in).
 *
 *   - Stale rows (workflow died without flipping status back to READY
 *     or persisting) are best-effort cleaned up on read by checking
 *     `getRun(workflow_id).status` and reverting via `updateMany`.
 *
 * Claim is atomic on Postgres-level:
 *   1. Try `prisma.summary.create` — wins if no row existed for the
 *      slot. P2002 fires if a row is already there.
 *   2. On P2002, try `prisma.summary.updateMany WHERE status = READY`
 *      to claim an existing READY row for re-generation. Returns
 *      count = 1 if we won, count = 0 if a different claimant already
 *      flipped the row to GENERATING.
 *   3. If both lose, fetch the row to read whose runId won.
 *
 * The workflow's persist step flips `status = READY` and sets
 * `workflow_id` to its own runId on success. The catch path uses
 * `revertWorkflowRow` to either DELETE the fresh row we just created
 * or revert a regen claim to READY (preserving any prior content).
 */

interface ActiveRun {
  runId: string;
  rowId: string;
}

// Workflow lifecycle states the runtime considers "still doing
// something." Anything else (`completed` / `failed` / `cancelled` /
// `expired`) means the run is no longer producing events; treat it
// as "no active run" and let the caller fall through to a fresh
// generate or a cached-row read.
async function isWorkflowActive(runId: string): Promise<boolean> {
  try {
    const status = await getRun(runId).status;
    return status === 'pending' || status === 'running';
  } catch {
    return false;
  }
}

export async function findActiveSummaryRun(
  prisma: PrismaClient,
  transcriptId: string,
  language: string | null
): Promise<ActiveRun | null> {
  const row = await prisma.summary.findFirst({
    where: {
      transcript_id: transcriptId,
      language,
      status: GenerationStatus.GENERATING,
    },
    select: { id: true, workflow_id: true },
  });
  if (row == null || row.workflow_id == null) {
    return null;
  }
  if (await isWorkflowActive(row.workflow_id)) {
    return { runId: row.workflow_id, rowId: row.id };
  }
  // Stale row: the workflow_id points at a run that's no longer
  // active (timed out, container killed, expired). Defer to the
  // content-aware revert helper so a fresh claim — content fields
  // all NULL — gets DELETEd instead of flipped to READY. A blind
  // status flip would leave a READY row with no content visible to
  // every downstream cache read, eventually crashing the client
  // when it tries to parse `null.content`.
  await revertSummaryRow(prisma, transcriptId, language, row.workflow_id);
  return null;
}

export async function findActiveArticleRun(
  prisma: PrismaClient,
  transcriptId: string,
  style: ArticleStyle,
  language: string | null
): Promise<ActiveRun | null> {
  const row = await prisma.article.findFirst({
    where: {
      transcript_id: transcriptId,
      style,
      language,
      status: GenerationStatus.GENERATING,
    },
    select: { id: true, workflow_id: true },
  });
  if (row == null || row.workflow_id == null) {
    return null;
  }
  if (await isWorkflowActive(row.workflow_id)) {
    return { runId: row.workflow_id, rowId: row.id };
  }
  // Same content-aware revert as findActiveSummaryRun — see comment
  // there for why we don't just blindly flip the status.
  await revertArticleRow(prisma, transcriptId, style, language, row.workflow_id);
  return null;
}

export interface ClaimResult {
  /** The runId whose stream callers should subscribe to. May be the
   *  one we passed in (we won), or another concurrent claimant's
   *  (we lost — cancel ours and pipe the winner instead). */
  winningRunId: string;
  /** True if our `newRunId` won the slot. False means a concurrent
   *  claimant got there first and the caller should
   *  `getRun(newRunId).cancel()` to free up our wasted workflow. */
  weWon: boolean;
}

/**
 * Claim a Summary slot for a new workflow. Either inserts a brand-new
 * GENERATING row or flips an existing READY row to GENERATING.
 *
 * `promptVersion` and `model` are required for the fresh-row insert
 * branch — Summary's schema marks them NOT NULL. The persist step
 * overwrites them anyway, but the insert needs valid values.
 */
export async function claimSummaryRun(
  prisma: PrismaClient,
  transcriptId: string,
  language: string | null,
  newRunId: string,
  promptVersion: string,
  model: string
): Promise<ClaimResult> {
  // Step 1: try to insert a fresh row. Fastest path when nothing
  // existed for the slot. The row goes in with content-fields=null;
  // the workflow's persist step will populate them and flip to READY.
  try {
    await prisma.summary.create({
      data: {
        transcript_id: transcriptId,
        language,
        status: GenerationStatus.GENERATING,
        workflow_id: newRunId,
        prompt_version: promptVersion,
        model,
      },
    });
    return { winningRunId: newRunId, weWon: true };
  } catch (err) {
    if (!(err instanceof Prisma.PrismaClientKnownRequestError) || err.code !== 'P2002') {
      throw err;
    }
  }

  // Step 2: a row exists for the slot. Try to flip it from READY to
  // GENERATING. This is the regen path. updateMany returns count = 1
  // if we claimed it, count = 0 if it was already GENERATING (or
  // someone else flipped it in the same instant).
  const flip = await prisma.summary.updateMany({
    where: {
      transcript_id: transcriptId,
      language,
      status: GenerationStatus.READY,
    },
    data: {
      status: GenerationStatus.GENERATING,
      workflow_id: newRunId,
    },
  });
  if (flip.count === 1) {
    return { winningRunId: newRunId, weWon: true };
  }

  // Step 3: someone else claimed the slot before us. Read the
  // winner's workflow_id so the caller can pipe their stream.
  const winner = await prisma.summary.findFirst({
    where: {
      transcript_id: transcriptId,
      language,
      status: GenerationStatus.GENERATING,
    },
    select: { workflow_id: true },
  });
  if (winner != null && winner.workflow_id != null) {
    return { winningRunId: winner.workflow_id, weWon: false };
  }

  // The row left GENERATING between our updateMany and the find — it
  // probably just completed. Treat us as the winner so the caller
  // proceeds with the start; if there's a race the next claimant
  // catches it.
  return { winningRunId: newRunId, weWon: true };
}

/**
 * Article variant of {@link claimSummaryRun}. Same flow; the slot is
 * keyed on `(transcript_id, style, language)`.
 */
export async function claimArticleRun(
  prisma: PrismaClient,
  transcriptId: string,
  style: ArticleStyle,
  language: string | null,
  newRunId: string,
  promptVersion: string,
  model: string
): Promise<ClaimResult> {
  try {
    await prisma.article.create({
      data: {
        transcript_id: transcriptId,
        style,
        language,
        status: GenerationStatus.GENERATING,
        workflow_id: newRunId,
        prompt_version: promptVersion,
        model,
      },
    });
    return { winningRunId: newRunId, weWon: true };
  } catch (err) {
    if (!(err instanceof Prisma.PrismaClientKnownRequestError) || err.code !== 'P2002') {
      throw err;
    }
  }

  const flip = await prisma.article.updateMany({
    where: {
      transcript_id: transcriptId,
      style,
      language,
      status: GenerationStatus.READY,
    },
    data: {
      status: GenerationStatus.GENERATING,
      workflow_id: newRunId,
    },
  });
  if (flip.count === 1) {
    return { winningRunId: newRunId, weWon: true };
  }

  const winner = await prisma.article.findFirst({
    where: {
      transcript_id: transcriptId,
      style,
      language,
      status: GenerationStatus.GENERATING,
    },
    select: { workflow_id: true },
  });
  if (winner != null && winner.workflow_id != null) {
    return { winningRunId: winner.workflow_id, weWon: false };
  }

  return { winningRunId: newRunId, weWon: true };
}

/**
 * Revert the Summary row a workflow left in GENERATING when it
 * fails. Called from the workflow's FatalError catch path (see
 * `summary/index.ts`). The fresh-vs-regen branch is decided by
 * inspecting the row's content state, not threaded via input:
 *
 *   - Fresh claim: the workflow's claim helper INSERTed a row with
 *     all content fields NULL. Nothing to revert to — DELETE the row
 *     so a follow-up Generate click sees a clean slot.
 *   - Regen claim: the claim helper flipped an existing READY row's
 *     status to GENERATING; its content fields are still populated
 *     from the prior successful generation. UPDATE status back to
 *     READY; the prior content becomes visible again. workflow_id is
 *     left pointing at the failed run so traces show what happened.
 *
 * Both queries are scoped to `workflow_id = ourRunId` so a concurrent
 * regen claim by a *different* workflow doesn't get clobbered, and
 * `headline IS NULL` (or `content IS NULL` for Article) decides the
 * branch — that's only true for rows we just inserted.
 */
export async function revertSummaryRow(
  prisma: PrismaClient,
  transcriptId: string,
  language: string | null,
  workflowRunId: string
): Promise<void> {
  const row = await prisma.summary.findFirst({
    where: {
      transcript_id: transcriptId,
      language,
      workflow_id: workflowRunId,
      status: GenerationStatus.GENERATING,
    },
    select: { id: true, headline: true, short: true, full: true },
  });
  if (row == null) {
    // Nothing to revert — the workflow never claimed, or another
    // run has already taken the slot.
    return;
  }
  // A fresh claim leaves all three content fields NULL. If any is
  // populated, this was a regen claim on top of a prior successful
  // generation; revert to READY rather than blowing away that
  // content.
  const isFreshClaim = row.headline == null && row.short == null && row.full == null;
  if (isFreshClaim) {
    await prisma.summary.delete({ where: { id: row.id } });
    return;
  }
  await prisma.summary.update({
    where: { id: row.id },
    data: { status: GenerationStatus.READY },
  });
}

export async function revertArticleRow(
  prisma: PrismaClient,
  transcriptId: string,
  style: ArticleStyle,
  language: string | null,
  workflowRunId: string
): Promise<void> {
  const row = await prisma.article.findFirst({
    where: {
      transcript_id: transcriptId,
      style,
      language,
      workflow_id: workflowRunId,
      status: GenerationStatus.GENERATING,
    },
    select: { id: true, content: true },
  });
  if (row == null) {
    return;
  }
  const isFreshClaim = row.content == null;
  if (isFreshClaim) {
    await prisma.article.delete({ where: { id: row.id } });
    return;
  }
  await prisma.article.update({
    where: { id: row.id },
    data: { status: GenerationStatus.READY },
  });
}

/**
 * Detects an in-flight refresh on a Channel row. Mirrors
 * `findActiveSummaryRun` / `findActiveArticleRun` but specialized for
 * the `Channel.status = REFRESHING` case used by the manual refresh
 * route and the cron's per-channel claim.
 *
 * Returns the runId of an active refresh workflow if one is currently
 * running. Returns null when:
 *   - the channel doesn't exist,
 *   - the channel is `READY`,
 *   - the channel is `REFRESHING` but its workflow is no longer active
 *     (timed out / crashed / expired). In this case the row is
 *     opportunistically reverted to `READY` so the caller can proceed
 *     with a fresh claim. The revert is guarded on `workflow_id` so a
 *     concurrent fresh claim by a different caller isn't clobbered.
 */
export async function findActiveChannelRefresh(
  prisma: PrismaClient,
  channelId: string
): Promise<{ runId: string } | null> {
  const row = await prisma.channel.findUnique({
    where: { id: channelId },
    select: { status: true, workflow_id: true },
  });
  if (row == null || row.status !== ChannelStatus.REFRESHING || row.workflow_id == null) {
    return null;
  }
  if (await isWorkflowActive(row.workflow_id)) {
    return { runId: row.workflow_id };
  }
  // Stale REFRESHING marker — workflow died without flipping back.
  // Channel rows always retain valid metadata even mid-refresh
  // (unlike Article/Summary which can have NULL content), so we just
  // flip status back to READY without touching `checked_at`. The
  // workflow_id is left pointing at the failed run for trace.
  await prisma.channel.updateMany({
    where: {
      id: channelId,
      status: ChannelStatus.REFRESHING,
      workflow_id: row.workflow_id,
    },
    data: { status: ChannelStatus.READY },
  });
  return null;
}

/**
 * Atomic claim helper for refresh workflows. Flips a channel row from
 * `READY` to `REFRESHING` and stamps `workflow_id`. Returns true if
 * the claim won, false if the row wasn't `READY` (meaning another
 * refresh workflow currently owns it).
 *
 * Callers are responsible for calling `findActiveChannelRefresh`
 * first to deal with stale REFRESHING markers — this helper does NOT
 * recover them, it only succeeds against a clean READY row.
 */
export async function claimChannelRefresh(
  prisma: PrismaClient,
  channelId: string,
  runId: string
): Promise<boolean> {
  const result = await prisma.channel.updateMany({
    where: { id: channelId, status: ChannelStatus.READY },
    data: { status: ChannelStatus.REFRESHING, workflow_id: runId },
  });
  return result.count === 1;
}

/**
 * Release a channel from `REFRESHING` back to `READY`. Guarded on
 * `workflow_id = runId` so callers don't accidentally release a row
 * that's been claimed by another concurrent workflow (shouldn't
 * happen in practice — claim is exclusive — but the guard makes the
 * release safe under unexpected interleaving). `workflow_id` is left
 * in place for audit.
 */
export async function releaseChannelRefresh(
  prisma: PrismaClient,
  channelId: string,
  runId: string
): Promise<void> {
  await prisma.channel.updateMany({
    where: { id: channelId, workflow_id: runId, status: ChannelStatus.REFRESHING },
    data: { status: ChannelStatus.READY },
  });
}
