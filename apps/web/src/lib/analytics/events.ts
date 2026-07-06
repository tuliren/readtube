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
 *
 * Every emit happens in a route handler (request scope), so `track()`
 * auto-reads the visitor headers from Vercel's ambient per-request
 * context. Fetch-source telemetry runs in Workflow/cron steps that have
 * no such context (so `track()` can't send there) — it's recorded on
 * the `fetched_via` DB column instead; see `FetchSource` in
 * `platforms/types.ts`.
 *
 * Emitters never throw (analytics must not break a request) but they
 * ARE awaited by callers. They stay silent in the development
 * environment (`VERCEL_ENV` unset or `development`), so local dev, the
 * `scripts/` probes, and Jest emit nothing.
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

async function emit(name: string, properties: Record<string, string>): Promise<void> {
  if (getVercelEnv(process.env.VERCEL_ENV) === VercelEnv.DEVELOPMENT) {
    return;
  }
  try {
    await track(name, properties);
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
