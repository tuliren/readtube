'use client';

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  type ChannelConsumption,
  consumptionRate,
  consumptionTooltip,
  consumptionTooltipText,
} from '@/lib/channels/consumption';

const SIZE = 14;
const STROKE = 2;
const CENTER = SIZE / 2;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/**
 * How long the pointer has to rest on the ring before the tooltip opens.
 * Short on purpose: the ring is a glanceable shape with no number on it,
 * so the tooltip is the only way to get the counts, and the native
 * `title` delay this replaced (roughly a second, and not configurable)
 * was long enough that the numbers felt unreachable.
 */
const TOOLTIP_DELAY_MS = 100;

interface Props {
  consumption: ChannelConsumption;
  /** Which edge the tooltip opens from. The sidebar defaults to `right`,
   *  where there is room beside the rail; the list header passes
   *  `bottom`, since there is nothing to its right but more header. */
  tooltipSide?: 'top' | 'right' | 'bottom' | 'left';
  /** How the tooltip lines up along that edge. `start` keeps a
   *  bottom-opening tooltip from hanging off to the left of a ring that
   *  sits near the start of a wide row. */
  tooltipAlign?: 'start' | 'center' | 'end';
}

/**
 * Circular progress ring showing how much of a channel the user actually
 * consumes (see `lib/channels/consumption.ts` for the metric). Sits
 * immediately after the channel name in the sidebar and in the list
 * header: it describes the channel, so it belongs beside the channel's
 * label rather than in the column the unread count owns.
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
 *
 * Carries its own `TooltipProvider` so it can drop into any row without
 * the caller supplying one, and so its delay stays short regardless of
 * whatever an ambient provider uses for the rest of that surface.
 */
export default function ConsumptionMeter({
  consumption,
  tooltipSide = 'right',
  tooltipAlign = 'center',
}: Props) {
  const rate = consumptionRate(consumption);
  const { headline, detail } = consumptionTooltip(consumption);

  return (
    <TooltipProvider delayDuration={TOOLTIP_DELAY_MS}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className="shrink-0 text-muted-foreground"
            role="img"
            aria-label={consumptionTooltipText(consumption)}
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
                  {/* Butt caps, not round: a round cap on a zero-length
                      dash renders as a dot in some browsers, which would
                      show a 0% channel as if it had a sliver of progress. */}
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
        </TooltipTrigger>
        {/* max-w forces the detail to wrap instead of stretching into a
            single unreadable line at 12px. */}
        <TooltipContent side={tooltipSide} align={tooltipAlign} className="max-w-56 leading-snug">
          <p className="font-medium">{headline}</p>
          <p className="opacity-80">{detail}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
