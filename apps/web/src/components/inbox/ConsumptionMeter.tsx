import {
  CONSUMPTION_METER_BARS,
  type ChannelConsumption,
  consumptionFilledBars,
  consumptionLevel,
  consumptionTooltip,
} from '@/lib/channels/consumption';

/**
 * Compact three-bar meter showing how often the user actually consumes a
 * channel (see `lib/channels/consumption.ts` for the metric). Sits to the
 * left of the unread badge on every channel row in the sidebar.
 *
 * Deliberately monochrome: it draws in `currentColor` at low opacity, so
 * it inherits the row's own foreground (muted at rest, blue when the row
 * is active) instead of introducing a second color scale that would fight
 * the unread badge for attention. The exact counts live in the `title`
 * tooltip; the bars themselves only answer "do I read this channel?".
 *
 * Renders nothing when the window holds too few videos to rate, which
 * keeps a brand-new or very quiet subscription from showing a
 * confidently wrong single bar.
 */
export default function ConsumptionMeter({ consumption }: { consumption: ChannelConsumption }) {
  const level = consumptionLevel(consumption);
  const tooltip = consumptionTooltip(consumption);
  if (level === 'unknown' || tooltip == null) {
    return null;
  }

  const filled = consumptionFilledBars(level);
  const bars = Array.from({ length: CONSUMPTION_METER_BARS }, (_, index) => index);

  return (
    <span
      className="flex shrink-0 items-end gap-px"
      role="img"
      aria-label={tooltip}
      title={tooltip}
    >
      {bars.map((index) => (
        <span
          key={index}
          // Heights step 3px / 5px / 7px so the shape reads as a rising
          // meter even for a viewer who can't distinguish the opacities.
          style={{ height: `${3 + index * 2}px` }}
          className={`w-[3px] rounded-[1px] bg-current ${
            index < filled ? 'opacity-70' : 'opacity-20'
          }`}
        />
      ))}
    </span>
  );
}
