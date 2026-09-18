/**
 * Per-channel consumption metric: how often a user actually *consumes*
 * a channel, as opposed to merely subscribing to it and letting it pile
 * up.
 *
 * A video counts as consumed when both are true:
 *
 *   1. The user has read it — an explicit `UserVideoConsumption` row, or
 *      coverage by the subscription's `read_at` watermark. This is the
 *      same "read" the inbox uses, so the metric never disagrees with
 *      the unread badge on the same row.
 *   2. It has generated content — a READY `Summary` or a READY `Article`
 *      on one of its transcripts. Reading in this product means reading
 *      the generated piece, so a video with no artifact was at best
 *      skimmed.
 *
 * The rate is `consumed / total` over the videos published in a trailing
 * window, floored at the subscription's own `created_at` so a three-day-old
 * subscription is judged on three days of videos rather than ninety. The
 * SQL that produces those two counts lives in
 * `getSubscribedChannelsWithUnread` (`lib/subscriptions.ts`).
 *
 * The sidebar renders the rate as a circular progress ring and never as a
 * number: the question is "do I actually read this?", and a percentage on
 * every row would compete with the unread count for attention. The exact
 * counts go in the row's tooltip.
 */

/** Trailing window, in days, that the metric looks at. */
export const CONSUMPTION_WINDOW_DAYS = 90;

/**
 * Minimum number of videos in the window before a rate is computed.
 * Below this, one skipped video swings the rate by 50 points, which
 * would render a confidently wrong ring on a quiet channel.
 */
export const CONSUMPTION_MIN_SAMPLE = 3;

/** Rate at or above which a channel counts as `high`. */
export const CONSUMPTION_HIGH_RATE = 0.5;

/** Rate at or above which a channel counts as `medium`. */
export const CONSUMPTION_MEDIUM_RATE = 0.2;

/**
 * `unknown` means "too few videos in the window to say". It still draws a
 * ring, in a flat dashed gray, so the column stays aligned and the row
 * can explain itself on hover rather than silently omitting the
 * indicator.
 */
export type ConsumptionLevel = 'unknown' | 'low' | 'medium' | 'high';

/** Raw per-channel counts, as returned by the sidebar channels payload. */
export interface ChannelConsumption {
  /** Videos published in the window. */
  total: number;
  /** Of those, the ones that meet the consumed definition above. */
  consumed: number;
  /**
   * True when the subscription is younger than `CONSUMPTION_WINDOW_DAYS`,
   * so the window starts at the subscribe date instead. Only affects copy.
   */
  sinceSubscribed: boolean;
}

const LEVEL_LABELS: Record<Exclude<ConsumptionLevel, 'unknown'>, string> = {
  low: 'Rarely read',
  medium: 'Sometimes read',
  high: 'Often read',
};

/**
 * Consumed fraction in [0, 1], or null when the window holds too few
 * videos to be worth reporting. The ring reads this directly — the
 * levels below only name it in prose.
 */
export function consumptionRate(consumption: ChannelConsumption): number | null {
  if (consumption.total < CONSUMPTION_MIN_SAMPLE) {
    return null;
  }
  return consumption.consumed / consumption.total;
}

/** Bucket the rate into the ordinal level the tooltip names. */
export function consumptionLevel(consumption: ChannelConsumption): ConsumptionLevel {
  const rate = consumptionRate(consumption);
  if (rate == null) {
    return 'unknown';
  }
  if (rate >= CONSUMPTION_HIGH_RATE) {
    return 'high';
  }
  if (rate >= CONSUMPTION_MEDIUM_RATE) {
    return 'medium';
  }
  return 'low';
}

function windowPhrase(consumption: ChannelConsumption): string {
  return consumption.sinceSubscribed
    ? 'since you subscribed'
    : `in the last ${CONSUMPTION_WINDOW_DAYS} days`;
}

/**
 * Tooltip for the ring. Always returns a string: an unrated channel has
 * to be able to say *why* it is a flat gray ring rather than leaving the
 * user to guess, so the unrated copy names both the video count it has
 * and the count it needs.
 *
 * Deliberately free of a percentage. The ring is the percentage; a number
 * beside it would only invite comparing two renderings of the same thing.
 */
export function consumptionTooltip(consumption: ChannelConsumption): string {
  const level = consumptionLevel(consumption);
  const period = windowPhrase(consumption);
  if (level === 'unknown') {
    if (consumption.total === 0) {
      return `Not rated yet: no videos ${period}`;
    }
    const plural = consumption.total === 1 ? 'video' : 'videos';
    return (
      `Not rated yet: only ${consumption.total} ${plural} ${period}, ` +
      `and it takes ${CONSUMPTION_MIN_SAMPLE} to rate a channel`
    );
  }
  return `${LEVEL_LABELS[level]}: you read ${consumption.consumed} of ${consumption.total} videos ${period}`;
}
