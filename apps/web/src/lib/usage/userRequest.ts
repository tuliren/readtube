import {
  type ArticleStyle,
  Prisma,
  type PrismaClient,
  UserRequestOutcome,
  UserRequestType,
} from '@readtube/database';

import {
  type ContentGenerationType,
  type GenerationOutcome,
  trackContentGenerated,
} from '@/lib/analytics/events';

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
  // The generation type this request completed — SUMMARY or ARTICLE.
  // Carried so the terminal analytics event can be labelled without a
  // re-read (the row's `type` isn't otherwise in scope here).
  type: UserRequestType;
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

const GENERATION_TYPE_LABEL: Record<UserRequestType, ContentGenerationType> = {
  [UserRequestType.TRANSCRIPT]: 'transcript',
  [UserRequestType.SUMMARY]: 'summary',
  [UserRequestType.ARTICLE]: 'article',
};

const GENERATION_OUTCOME_LABEL: Record<UserRequestOutcome, GenerationOutcome> = {
  [UserRequestOutcome.GENERATED]: 'generated',
  [UserRequestOutcome.UNAVAILABLE]: 'unavailable',
  [UserRequestOutcome.FAILED]: 'failed',
};

/**
 * Fire the `content_generated` analytics event for a terminal outcome.
 * Emitted from every place that writes a *terminal* outcome so each
 * generation is counted exactly once:
 *   - transcript rows are always terminal;
 *   - summary/article FAILED/UNAVAILABLE rows written pre-flight are
 *     terminal, while the in-flight GENERATED insert is not (it's
 *     completed later via `completeUserRequest`).
 *
 * Awaited by callers (the emitter never throws): the summary/article
 * completions run in Workflow steps with no `waitUntil`, so the event
 * only sends if we wait for it.
 */
function emitGenerationEvent(type: UserRequestType, outcome: UserRequestOutcome): Promise<void> {
  return trackContentGenerated(GENERATION_TYPE_LABEL[type], GENERATION_OUTCOME_LABEL[outcome]);
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
  // Transcript rows are always terminal (GENERATED or UNAVAILABLE).
  await emitGenerationEvent(UserRequestType.TRANSCRIPT, params.outcome);
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
  // Only pre-flight terminal rows (e.g. transcript-unavailable FAILED)
  // count here; the in-flight GENERATED insert is completed later.
  if (!isAsyncStart) {
    await emitGenerationEvent(UserRequestType.SUMMARY, params.outcome);
  }
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
  if (!isAsyncStart) {
    await emitGenerationEvent(UserRequestType.ARTICLE, params.outcome);
  }
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
  // Counts the same generations the audit log does: callers skip this
  // function for force/per-field regens (they pass no request id), so
  // those opt out of both the audit row and the analytics event —
  // consistent with how quota is metered off `UserRequest`.
  await emitGenerationEvent(params.type, params.outcome);
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
