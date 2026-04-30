import { type Run, getRun } from 'workflow/api';

/**
 * NDJSON content-type used by the summary/article generate routes for
 * both the live workflow stream and the cached-row replay paths.
 * Re-using a single header object keeps the response shape identical
 * across paths so the client doesn't have to branch on it.
 */
export const NDJSON_HEADERS = {
  'Content-Type': 'application/x-ndjson; charset=utf-8',
  'Cache-Control': 'no-cache, no-transform',
} as const;

/**
 * Wrap a workflow run's readable stream as an NDJSON `Response`. Each
 * event in the workflow's typed readable becomes a single JSON line
 * in the response body, matching the wire format the client's
 * SummaryReader / ArticleReader expects.
 *
 * Always reads from `startIndex: 0` so a client tapping into an
 * already-running workflow gets the full stream replayed from the
 * beginning — same UX as starting fresh, just with the leading deltas
 * arriving in a single batch from the redis log instead of trickling
 * in as the model produces them.
 */
export function ndjsonResponseFromRun<E>(runIdOrRun: string | Run<unknown>): Response {
  const run = typeof runIdOrRun === 'string' ? getRun(runIdOrRun) : runIdOrRun;
  const encoder = new TextEncoder();
  const ndjsonStream = run.getReadable<E>({ startIndex: 0 }).pipeThrough(
    new TransformStream<E, Uint8Array>({
      transform(event, controller) {
        controller.enqueue(encoder.encode(JSON.stringify(event) + '\n'));
      },
    })
  );
  return new Response(ndjsonStream, { headers: NDJSON_HEADERS });
}
