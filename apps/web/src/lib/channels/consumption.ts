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
 *      the unread badge sitting next to it.
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
 * Levels (not the raw percentage) are what the sidebar renders: the point
 * of the indicator is "do I actually read this?", which is an ordinal
 * question, and a percentage would compete with the unread count for
 * attention. The exact numbers go in the row's tooltip.
 */

/** Trailing window, in days, that the metric looks at. */
export const CONSUMPTION_WINDOW_DAYS = 90;

/**
 * Minimum number of videos in the window before a level is assigned.
 * Below this, one skipped video swings the rate by 50 points, which
 * would render a confidently wrong meter on a quiet channel.
 */
export const CONSUMPTION_MIN_SAMPLE = 3;

/** Rate at or above which a channel counts as `high`. */
export const CONSUMPTION_HIGH_RATE = 0.5;

/** Rate at or above which a channel counts as `medium`. */
export const CONSUMPTION_MEDIUM_RATE = 0.2;

/**
 * `unknown` means "too few videos in the window to say" and renders
 * nothing at all, which is deliberately different from `low` (a channel
 * we *do* have evidence about, and the evidence says you skip it).
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

/** Number of filled bars the meter draws, out of `CONSUMPTION_METER_BARS`. */
export const CONSUMPTION_METER_BARS = 3;

const FILLED_BARS: Record<ConsumptionLevel, number> = {
  unknown: 0,
  low: 1,
  medium: 2,
  high: 3,
};

const LEVEL_LABELS: Record<ConsumptionLevel, string> = {
  unknown: 'Not enough videos yet',
  low: 'Rarely read',
  medium: 'Sometimes read',
  high: 'Often read',
};

/**
 * Consumed fraction in [0, 1], or null when the window holds too few
 * videos to be worth reporting.
 */
export function consumptionRate(consumption: ChannelConsumption): number | null {
  if (consumption.total < CONSUMPTION_MIN_SAMPLE) {
    return null;
  }
  return consumption.consumed / consumption.total;
}

/** Bucket the rate into the ordinal level the meter renders. */
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

export function consumptionFilledBars(level: ConsumptionLevel): number {
  return FILLED_BARS[level];
}

/**
 * One-line tooltip for the meter, e.g.
 * `Often read: 8 of 12 videos in the last 90 days`.
 * Returns null for `unknown`, where the meter renders nothing anyway.
 */
export function consumptionTooltip(consumption: ChannelConsumption): string | null {
  const rate = consumptionRate(consumption);
  if (rate == null) {
    return null;
  }
  const period = consumption.sinceSubscribed
    ? 'since you subscribed'
    : `in the last ${CONSUMPTION_WINDOW_DAYS} days`;
  return (
    `${LEVEL_LABELS[consumptionLevel(consumption)]}: ` +
    `you read ${consumption.consumed} of ${consumption.total} videos ${period} ` +
    `(${Math.round(rate * 100)}%)`
  );
}
