/**
 * Server-side Vercel Web Analytics custom events.
 *
 * Vercel's plan caps a custom event at **2 properties**, so each event
 * here carries at most two, and we split concerns across three event
 * names rather than one fat event:
 *
 *   - `content_generated` {type, outcome} — a transcript fetch, summary,
 *     or article generation reached a terminal outcome. Lets us chart
 *     how much derived content users generate.
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
 */
import { VideoPlatformType } from '@readtube/database';
import { track } from '@vercel/analytics/server';

import { VercelEnv, getVercelEnv } from '@/lib/vercelEnv';

export type ContentGenerationType = 'transcript' | 'summary' | 'article';
export type GenerationOutcome = 'generated' | 'unavailable' | 'failed';

export type ContentAddType = 'video' | 'playlist' | 'channel';
export type ContentPlatform = 'youtube' | 'bilibili';

export type YouTubeFetchType = 'channel' | 'video' | 'playlist' | 'scheduled';
export type YouTubeFetchSource = 'data_api' | 'rss' | 'scrape' | 'transcript_api';

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
