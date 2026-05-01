import { type AddChannelResult, fetchAndPersistChannelStep } from './steps';

export { FETCH_FAILED_PREFIX, INVALID_URL_PREFIX } from './steps';
export type { AddChannelResult } from './steps';

/**
 * Channel-add max duration. Matches the cron's per-batch budget — a
 * single channel with full RSS + scrape + per-video upserts should
 * complete well inside this window.
 */
export const maxDuration = 300;

/**
 * Adds a channel to the DB by fetching its full upstream snapshot
 * (metadata + videos) and upserting both atomically. Used by `POST
 * /api/channels`; the route handles `UserSubscription` creation
 * separately so two simultaneous adds by different users only do the
 * fetch once per channel.
 *
 * Concurrent adds of the same channel are safe by construction:
 * `upsertChannelWithVideos` keys on `(source_type, source_id)` via
 * `findUnique + create/update`, and per-video upserts use
 * `video_unique_source`. The new `Channel.status`/`workflow_id`
 * columns are not touched here — they exist solely for refresh dedup
 * (manual single-channel refresh + cron). See `runRegistry.ts`.
 */
export async function addChannelWorkflow(args: { input: string }): Promise<AddChannelResult> {
  'use workflow';
  return fetchAndPersistChannelStep(args.input);
}
