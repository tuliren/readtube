import {
  CONSUMPTION_MIN_SAMPLE,
  type ChannelConsumption,
  type ConsumptionLevel,
  type ConsumptionTooltip,
  consumptionLevel,
  consumptionRate,
  consumptionTooltip,
  consumptionTooltipText,
} from '../consumption';

function consumption(total: number, consumed: number): ChannelConsumption {
  return { total, consumed };
}

describe('consumptionRate', () => {
  it.each([
    ['no videos', 0, 0],
    ['one video', 1, 1],
    ['just below the minimum sample', CONSUMPTION_MIN_SAMPLE - 1, CONSUMPTION_MIN_SAMPLE - 1],
  ])('returns null for %s', (_label, total, consumed) => {
    expect(consumptionRate(consumption(total, consumed))).toBeNull();
  });

  it.each([
    [CONSUMPTION_MIN_SAMPLE, CONSUMPTION_MIN_SAMPLE, 1],
    [20, 0, 0],
    [20, 10, 0.5],
    [8, 2, 0.25],
  ])('rates %i videos with %i consumed as %f', (total, consumed, expected) => {
    expect(consumptionRate(consumption(total, consumed))).toBeCloseTo(expected);
  });
});

describe('consumptionLevel', () => {
  it.each<[string, number, number, ConsumptionLevel]>([
    ['below the minimum sample', 2, 2, 'unknown'],
    ['nothing consumed', 20, 0, 'low'],
    ['just below the medium threshold', 100, 19, 'low'],
    ['exactly at the medium threshold', 100, 20, 'medium'],
    ['just below the high threshold', 100, 49, 'medium'],
    ['exactly at the high threshold', 100, 50, 'high'],
    ['everything consumed', 20, 20, 'high'],
  ])('classifies %s as %s', (_label, total, consumed, expected) => {
    expect(consumptionLevel(consumption(total, consumed))).toBe(expected);
  });
});

describe('consumptionTooltip', () => {
  it.each<[string, ChannelConsumption, ConsumptionTooltip]>([
    [
      'a full sample',
      consumption(20, 15),
      { headline: 'Often read', detail: 'You read 15 of the 20 most recent videos.' },
    ],
    [
      'a channel shorter than the sample',
      consumption(8, 1),
      { headline: 'Rarely read', detail: 'You read 1 of the 8 most recent videos.' },
    ],
  ])('splits the verdict from the counts for %s', (_label, input, expected) => {
    expect(consumptionTooltip(input)).toEqual(expected);
  });

  it('never quotes a percentage, since the ring already is one', () => {
    expect(consumptionTooltipText(consumption(20, 15))).not.toMatch(/%/);
  });

  it.each<[string, ChannelConsumption, ConsumptionTooltip]>([
    [
      'no videos at all',
      consumption(0, 0),
      { headline: 'Not rated yet', detail: 'This channel has no videos.' },
    ],
    [
      'a single video',
      consumption(1, 1),
      {
        headline: 'Not rated yet',
        detail: `This channel has only 1 video, and it takes ${CONSUMPTION_MIN_SAMPLE} to rate one.`,
      },
    ],
    [
      'two videos',
      consumption(2, 0),
      {
        headline: 'Not rated yet',
        detail: `This channel has only 2 videos, and it takes ${CONSUMPTION_MIN_SAMPLE} to rate one.`,
      },
    ],
  ])('explains why %s leaves the ring unrated', (_label, input, expected) => {
    expect(consumptionTooltip(input)).toEqual(expected);
  });
});

describe('consumptionTooltipText', () => {
  it.each<[string, ChannelConsumption, string]>([
    [
      'a rated channel',
      consumption(20, 15),
      'Often read. You read 15 of the 20 most recent videos.',
    ],
    ['an unrated channel', consumption(0, 0), 'Not rated yet. This channel has no videos.'],
  ])('flattens both lines into one label for %s', (_label, input, expected) => {
    expect(consumptionTooltipText(input)).toBe(expected);
  });
});
