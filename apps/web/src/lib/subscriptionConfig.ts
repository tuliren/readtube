/**
 * Configuration for what happens when a user subscribes to a new channel —
 * specifically, how the per-subscription read watermark (UserSubscription.read_at)
 * is initialized.
 */

export type NewSubscriptionMode = 'all_new' | 'none_new' | 'recent_n_new';

/**
 * How to initialize `UserSubscription.read_at` when a user first subscribes
 * to a channel:
 *
 * - `all_new`     — read_at = null. Every existing video appears as unread.
 *                   The user gets the full backlog.
 * - `none_new`    — read_at = now. Every existing video appears as read.
 *                   The user only sees videos published after subscribing.
 * - `recent_n_new` — read_at = published_at of the (RECENT_NEW_VIDEO_COUNT + 1)th
 *                    most recent video. Only the N most recent videos appear
 *                    as unread; older ones are pre-marked as read. If the channel
 *                    has fewer than (N+1) videos, falls through to `all_new`
 *                    behavior (everything appears unread).
 */
export const NEW_SUBSCRIPTION_MODE: NewSubscriptionMode = 'recent_n_new';

/**
 * The number of most recent videos that should appear as unread when
 * `NEW_SUBSCRIPTION_MODE` is `recent_n_new`.
 */
export const RECENT_NEW_VIDEO_COUNT = 3;
