/**
 * How long a Channel's metadata + video list is considered fresh.
 * Used by both the refresh-channels cron (to pick stale rows to
 * re-snapshot) and the add-channel API route (to decide whether to
 * re-fetch when the user adds a channel whose row already exists as
 * a shadow from the add-video / add-playlist flow).
 */
export const STALE_DAYS = 5;

/**
 * Minimum gap between user-triggered manual refreshes for a channel.
 * The header refresh button is disabled until at least this many days
 * have elapsed since `checked_at`.
 */
export const MANUAL_REFRESH_DAYS = 1;

const STALE_MS = STALE_DAYS * 24 * 60 * 60 * 1000;
const MANUAL_REFRESH_MS = MANUAL_REFRESH_DAYS * 24 * 60 * 60 * 1000;

/**
 * True if `checked_at` is non-null AND within the staleness window.
 * A channel with checked_at = null is never fresh — the null means
 * the row exists but no snapshot has ever been fetched (typical for
 * shadow rows created by the add-video flow).
 */
export function isChannelFresh(checkedAt: Date | null): boolean {
  if (checkedAt == null) {
    return false;
  }
  return checkedAt.getTime() > Date.now() - STALE_MS;
}

/**
 * True if a user-triggered manual refresh is allowed for the channel —
 * i.e. either no snapshot has ever been taken, or the last snapshot is
 * older than the manual-refresh threshold.
 */
export function canManuallyRefresh(checkedAt: Date | null): boolean {
  if (checkedAt == null) {
    return true;
  }
  return checkedAt.getTime() <= Date.now() - MANUAL_REFRESH_MS;
}
