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
 * The rate is `consumed / total` over the channel's
 * `CONSUMPTION_RECENT_VIDEO_COUNT` most recent videos. Counting videos
 * rather than days is what keeps a slow channel ratable: a calendar
 * window says "no data" for anything that hasn't posted lately, even
 * when the user worked through its whole back catalogue. The SQL that
 * produces the two counts lives in `getSubscribedChannelsWithUnread`
 * (`lib/subscriptions.ts`).
 *
 * The sidebar renders the rate as a circular progress ring and never as a
 * number: the question is "do I actually read this?", and a percentage on
 * every row would compete with the unread count for attention. The exact
 * counts go in the row's tooltip.
 */

/**
 * How many of the channel's most recent videos the rate is computed
 * over. Big enough that one skipped video doesn't swing it, small
 * enough that it tracks what the user does now rather than what they
 * did years ago.
 */
export const CONSUMPTION_RECENT_VIDEO_COUNT = 30;

/**
 * Minimum number of videos before a rate is computed. Below this, one
 * skipped video swings the rate by 50 points, which would render a
 * confidently wrong ring on a channel that has barely published.
 */
export const CONSUMPTION_MIN_SAMPLE = 3;

/** Rate at or above which a channel counts as `high`. */
export const CONSUMPTION_HIGH_RATE = 0.5;

/** Rate at or above which a channel counts as `medium`. */
export const CONSUMPTION_MEDIUM_RATE = 0.2;

/**
 * `unknown` means "too few videos to say". It still draws a ring, in a
 * flat dashed gray, so the column stays aligned and the row can explain
 * itself on hover rather than silently omitting the indicator.
 */
export type ConsumptionLevel = 'unknown' | 'low' | 'medium' | 'high';

/** Raw per-channel counts, as returned by the sidebar channels payload. */
export interface ChannelConsumption {
  /**
   * How many videos the rate is computed over: the channel's video
   * count, capped at `CONSUMPTION_RECENT_VIDEO_COUNT`.
   */
  total: number;
  /** Of those, the ones that meet the consumed definition above. */
  consumed: number;
}

const LEVEL_LABELS: Record<Exclude<ConsumptionLevel, 'unknown'>, string> = {
  low: 'Rarely read',
  medium: 'Sometimes read',
  high: 'Often read',
};

/**
 * Consumed fraction in [0, 1], or null when there are too few videos to
 * be worth reporting. The ring reads this directly — the levels below
 * only name it in prose.
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

/**
 * Tooltip copy for the ring, split into a verdict and the evidence
 * behind it so the surface can stack them on separate lines. Run
 * together on one line the sentence is long enough to be a chore to
 * read at 12px, which is the whole reason it is two fields.
 */
export interface ConsumptionTooltip {
  /** The verdict, on its own line: "Often read", "Not rated yet". */
  headline: string;
  /** The counts behind the verdict, wrapping onto as many lines as it needs. */
  detail: string;
}

/**
 * Tooltip for the ring. Always returns copy: an unrated channel has to
 * be able to say *why* it is a flat gray ring rather than leaving the
 * user to guess, so the unrated detail names both the video count it has
 * and the count it needs.
 *
 * Deliberately free of a percentage. The ring is the percentage; a number
 * beside it would only invite comparing two renderings of the same thing.
 */
export function consumptionTooltip(consumption: ChannelConsumption): ConsumptionTooltip {
  const level = consumptionLevel(consumption);
  if (level === 'unknown') {
    if (consumption.total === 0) {
      return { headline: 'Not rated yet', detail: 'This channel has no videos.' };
    }
    const plural = consumption.total === 1 ? 'video' : 'videos';
    return {
      headline: 'Not rated yet',
      detail:
        `This channel has only ${consumption.total} ${plural}, ` +
        `and it takes ${CONSUMPTION_MIN_SAMPLE} to rate one.`,
    };
  }
  return {
    headline: LEVEL_LABELS[level],
    detail: `You read ${consumption.consumed} of the ${consumption.total} most recent videos.`,
  };
}

/**
 * The same copy as one string, for an `aria-label`. Assistive tech reads
 * a label, not a layout, so the two lines collapse into one sentence.
 */
export function consumptionTooltipText(consumption: ChannelConsumption): string {
  const { headline, detail } = consumptionTooltip(consumption);
  return `${headline}. ${detail}`;
}
