import {
  type ChannelConsumption,
  consumptionRate,
  consumptionTooltip,
} from '@/lib/channels/consumption';

const SIZE = 14;
const STROKE = 2;
const CENTER = SIZE / 2;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/**
 * Circular progress ring showing how much of a channel the user actually
 * consumes (see `lib/channels/consumption.ts` for the metric). Sits
 * immediately after the channel name, not out on the right rail: it
 * describes the channel, so it belongs beside the channel's label rather
 * than in the column the unread count owns.
 *
 * Two states:
 *
 *   - Rated — a light gray track with a darker gray arc sweeping
 *     clockwise from 12 o'clock over the consumed fraction. No number:
 *     the arc *is* the percentage, and a figure beside it would only
 *     invite comparing two renderings of the same value.
 *   - Unrated — a flat dashed gray ring. The dashes read as
 *     "indeterminate" rather than "zero", which matters because a
 *     genuine 0% channel draws a complete (if empty) track. The tooltip
 *     says how many videos the channel has and how many it takes.
 *
 * Both strokes are `currentColor` at different opacities over an
 * explicit `text-muted-foreground`, so the ring stays gray on the active
 * blue row and picks up the right gray in dark mode without a second
 * color scale.
 */
export default function ConsumptionMeter({ consumption }: { consumption: ChannelConsumption }) {
  const rate = consumptionRate(consumption);
  const tooltip = consumptionTooltip(consumption);

  return (
    <span
      className="shrink-0 text-muted-foreground"
      role="img"
      aria-label={tooltip}
      title={tooltip}
    >
      <svg
        width={SIZE}
        height={SIZE}
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        fill="none"
        className="block"
        aria-hidden="true"
      >
        {rate == null ? (
          <circle
            cx={CENTER}
            cy={CENTER}
            r={RADIUS}
            stroke="currentColor"
            strokeWidth={STROKE}
            strokeOpacity={0.35}
            strokeDasharray="2 2.2"
          />
        ) : (
          <>
            <circle
              cx={CENTER}
              cy={CENTER}
              r={RADIUS}
              stroke="currentColor"
              strokeWidth={STROKE}
              strokeOpacity={0.2}
            />
            {/* Butt caps, not round: a round cap on a zero-length dash
                renders as a dot in some browsers, which would show a
                0% channel as if it had a sliver of progress. */}
            <circle
              cx={CENTER}
              cy={CENTER}
              r={RADIUS}
              stroke="currentColor"
              strokeWidth={STROKE}
              strokeOpacity={0.85}
              strokeLinecap="butt"
              strokeDasharray={`${rate * CIRCUMFERENCE} ${CIRCUMFERENCE}`}
              transform={`rotate(-90 ${CENTER} ${CENTER})`}
            />
          </>
        )}
      </svg>
    </span>
  );
}
