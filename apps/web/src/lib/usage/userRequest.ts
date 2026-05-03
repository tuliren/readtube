import {
  type ArticleStyle,
  Prisma,
  type PrismaClient,
  UserRequestOutcome,
  UserRequestType,
} from '@readtube/database';

/**
 * Helpers for writing rows into the `UserRequest` audit table —
 * one place that knows the schema so call sites (the route handlers,
 * `ensureTranscript`, the workflow persist/revert steps) stay terse.
 *
 * Design contract:
 *   - One row per user-initiated POST. Auto-fetched transcripts inside
 *     summary/article POSTs are recorded as their own TRANSCRIPT row
 *     so upstream cost and LLM cost are attributable independently.
 *   - For async paths (summary/article fresh start), the route inserts
 *     a row with `outcome=GENERATED, completed_at=null` and threads
 *     `id` into the workflow input. The persist step backfills `usage`
 *     and `completed_at` via `completeUserRequest`; on failure the
 *     revert step flips outcome=FAILED with an error message.
 *   - This audit log does NOT replace Summary/Article's own
 *     model/prompt_version/usage. Those remain the canonical "what
 *     produced the cached row" record; UserRequest is layered alongside
 *     so a regen overwriting the cache row doesn't erase prior
 *     attributions.
 *
 * All recorders are wrapped in `try/catch` at the call site (or here)
 * — failing to write an audit row should never break the user's
 * actual request.
 */

interface BaseRequestParams {
  userId: string;
  videoId: string;
}

interface RecordTranscriptParams extends BaseRequestParams {
  outcome: UserRequestOutcome;
  transcriptId?: string | null;
  errorMessage?: string | null;
}

interface RecordSummaryParams extends BaseRequestParams {
  outcome: UserRequestOutcome;
  language: string | null;
  model?: string | null;
  promptVersion?: string | null;
  summaryId?: string | null;
  workflowId?: string | null;
  errorMessage?: string | null;
}

interface RecordArticleParams extends BaseRequestParams {
  outcome: UserRequestOutcome;
  language: string | null;
  style: ArticleStyle;
  model?: string | null;
  promptVersion?: string | null;
  articleId?: string | null;
  workflowId?: string | null;
  errorMessage?: string | null;
}

interface CompleteParams {
  outcome: UserRequestOutcome;
  // For Summary/Article generated runs, the persist step passes the
  // final `result.usage` JSON. Untyped because the AI SDK shape varies
  // across step types (Summary aggregates per-field, Article aggregates
  // per-strategy).
  usage?: unknown;
  summaryId?: string | null;
  articleId?: string | null;
  errorMessage?: string | null;
}

function jsonOrNull(value: unknown): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  if (value == null) {
    return Prisma.JsonNull;
  }
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export async function recordTranscriptRequest(
  prisma: PrismaClient,
  params: RecordTranscriptParams
): Promise<{ id: string }> {
  const row = await prisma.userRequest.create({
    data: {
      user_id: params.userId,
      type: UserRequestType.TRANSCRIPT,
      outcome: params.outcome,
      video_id: params.videoId,
      transcript_id: params.transcriptId ?? null,
      error_message: params.errorMessage ?? null,
      // Transcript flow is fully synchronous from the route's view:
      // stamp completed_at at insert time so analytics queries that
      // join on `completed_at IS NOT NULL` see these rows.
      completed_at: new Date(),
    },
    select: { id: true },
  });
  return row;
}

export async function recordSummaryRequest(
  prisma: PrismaClient,
  params: RecordSummaryParams
): Promise<{ id: string }> {
  const isAsyncStart = params.outcome === UserRequestOutcome.GENERATED;
  const row = await prisma.userRequest.create({
    data: {
      user_id: params.userId,
      type: UserRequestType.SUMMARY,
      outcome: params.outcome,
      video_id: params.videoId,
      summary_id: params.summaryId ?? null,
      language: params.language,
      model: params.model ?? null,
      prompt_version: params.promptVersion ?? null,
      workflow_id: params.workflowId ?? null,
      error_message: params.errorMessage ?? null,
      // GENERATED rows are inserted before the workflow runs; the
      // persist step backfills `completed_at` and `usage`. All other
      // outcomes are synchronous — stamp now.
      completed_at: isAsyncStart ? null : new Date(),
    },
    select: { id: true },
  });
  return row;
}

export async function recordArticleRequest(
  prisma: PrismaClient,
  params: RecordArticleParams
): Promise<{ id: string }> {
  const isAsyncStart = params.outcome === UserRequestOutcome.GENERATED;
  const row = await prisma.userRequest.create({
    data: {
      user_id: params.userId,
      type: UserRequestType.ARTICLE,
      outcome: params.outcome,
      video_id: params.videoId,
      article_id: params.articleId ?? null,
      language: params.language,
      style: params.style,
      model: params.model ?? null,
      prompt_version: params.promptVersion ?? null,
      workflow_id: params.workflowId ?? null,
      error_message: params.errorMessage ?? null,
      completed_at: isAsyncStart ? null : new Date(),
    },
    select: { id: true },
  });
  return row;
}

/**
 * Backfill an in-flight UserRequest after the workflow's terminal
 * step. Called by `persistSummaryStep` / `persistArticleStep` on
 * success and by `revertSummaryRowStep` / `revertArticleRowStep` on
 * failure. No-op on a missing id so callers can opt out cleanly
 * (force regen, etc.).
 */
export async function completeUserRequest(
  prisma: PrismaClient,
  requestId: string | null | undefined,
  params: CompleteParams
): Promise<void> {
  if (requestId == null || requestId === '') {
    return;
  }
  await prisma.userRequest.update({
    where: { id: requestId },
    data: {
      outcome: params.outcome,
      usage: 'usage' in params ? jsonOrNull(params.usage) : undefined,
      summary_id: params.summaryId ?? undefined,
      article_id: params.articleId ?? undefined,
      error_message: params.errorMessage ?? undefined,
      completed_at: new Date(),
    },
  });
}
