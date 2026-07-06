/**
 * Server-side Vercel Web Analytics custom events.
 *
 * Vercel's plan caps a custom event at **2 properties**, so each event
 * here carries at most two, and we split concerns across three event
 * names rather than one fat event:
 *
 *   - `content_generated` {type, outcome} — content generation activity.
 *     Transcript carries its terminal outcome (generated/unavailable).
 *     Summary/article carry `started` instead: their real terminal
 *     outcome is only known inside a Workflow step, which can't emit
 *     (no request context — see below), so we count them at request
 *     time when generation kicks off.
 *   - `content_added` {type, platform} — a user added a video, playlist,
 *     or channel to their library.
 *   - `youtube_fetch` {type, source} — YouTube metadata was fetched and
 *     which tier served it (Data API vs the scrape / RSS / TranscriptAPI
 *     fallbacks). This is how we watch how often the fallbacks fire.
 *
 * Emitters never throw (analytics must not break a request or a
 * workflow step) but they ARE awaited by callers: outside an HTTP
 * request there's no `waitUntil` to flush the send, so the caller has
 * to await for the event to actually leave. They stay silent in the
 * development environment (`VERCEL_ENV` unset or `development`), so
 * local dev, the `scripts/` probes, and Jest emit nothing.
 *
 * Workflow/cron caveat (verified on a preview deploy): `track()` reads
 * the visitor headers from Vercel's ambient per-request context, which
 * is present in route handlers but NOT in Workflow/cron steps
 * (add-channel, refresh-channels, summary/article generation). Without
 * a headers value it throws "No session context found" and the event
 * never sends — which is why `youtube_fetch` (type=channel) and
 * `content_generated` (summary/article) were missing. So we pass an
 * empty headers object when there's no ambient context.
 */
import { VideoPlatformType } from '@readtube/database';
import { track } from '@vercel/analytics/server';

import { VercelEnv, getVercelEnv } from '@/lib/vercelEnv';

export type ContentGenerationType = 'transcript' | 'summary' | 'article';
/**
 * `started` is request-time only (summary/article, whose terminal
 * outcome lands in an un-emittable Workflow step); the others are
 * terminal outcomes carried by transcript and the pre-flight failures.
 */
export type GenerationOutcome = 'generated' | 'unavailable' | 'failed' | 'started';

export type ContentAddType = 'video' | 'playlist' | 'channel';
export type ContentPlatform = 'youtube' | 'bilibili';

export type YouTubeFetchType = 'channel' | 'video' | 'playlist' | 'scheduled';
export type YouTubeFetchSource = 'data_api' | 'rss' | 'scrape' | 'transcript_api';

// Vercel populates this global with the per-request context (visitor
// headers + `waitUntil`) during an HTTP request. `track()` reads the
// headers from it; it's absent in Workflow/cron steps, so we mirror the
// library's own lookup to decide whether to let `track()` auto-read the
// real headers (request scope) or hand it an empty object (workflow).
const REQUEST_CONTEXT_SYMBOL = Symbol.for('@vercel/request-context');

interface RequestContextStore {
  get?: () => { headers?: unknown } | undefined;
}

function hasAmbientRequestHeaders(): boolean {
  const store = (globalThis as Record<symbol, RequestContextStore | undefined>)[
    REQUEST_CONTEXT_SYMBOL
  ];
  return store?.get?.()?.headers != null;
}

async function emit(name: string, properties: Record<string, string>): Promise<void> {
  if (getVercelEnv(process.env.VERCEL_ENV) === VercelEnv.DEVELOPMENT) {
    return;
  }
  try {
    // Request scope: pass nothing so `track()` auto-reads the real
    // visitor headers (and flushes via `waitUntil`). Workflow/cron: no
    // ambient context, so pass an empty headers object — enough to get
    // past `track()`'s session requirement so the event still sends
    // (unattributed but counted).
    await track(name, properties, hasAmbientRequestHeaders() ? undefined : { headers: {} });
  } catch (error) {
    console.error(error);
  }
}

/**
 * A transcript fetch / summary / article generation reached a terminal
 * outcome. Emitted from the `UserRequest` audit-log writers, which are
 * the single choke point that sees every terminal outcome.
 */
export function trackContentGenerated(
  type: ContentGenerationType,
  outcome: GenerationOutcome
): Promise<void> {
  return emit('content_generated', { type, outcome });
}

/** Map the DB platform enum to the analytics property value. */
export function platformLabel(type: VideoPlatformType): ContentPlatform {
  return type === VideoPlatformType.BILIBILI ? 'bilibili' : 'youtube';
}

/** A user added a video / playlist / channel to their library. */
export function trackContentAdded(type: ContentAddType, platform: ContentPlatform): Promise<void> {
  return emit('content_added', { type, platform });
}

/**
 * YouTube metadata was fetched, tagged with which tier served it so we
 * can see how often the scrape / RSS / TranscriptAPI fallbacks fire
 * behind the Data API.
 */
export function trackYouTubeFetch(
  type: YouTubeFetchType,
  source: YouTubeFetchSource
): Promise<void> {
  return emit('youtube_fetch', { type, source });
}
