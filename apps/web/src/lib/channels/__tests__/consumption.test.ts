import {
  CONSUMPTION_MIN_SAMPLE,
  CONSUMPTION_WINDOW_DAYS,
  type ChannelConsumption,
  type ConsumptionLevel,
  consumptionLevel,
  consumptionRate,
  consumptionTooltip,
} from '../consumption';

function consumption(total: number, consumed: number, sinceSubscribed = false): ChannelConsumption {
  return { total, consumed, sinceSubscribed };
}

describe('consumptionRate', () => {
  it.each([
    ['empty window', 0, 0],
    ['one video', 1, 1],
    ['just below the minimum sample', CONSUMPTION_MIN_SAMPLE - 1, CONSUMPTION_MIN_SAMPLE - 1],
  ])('returns null for %s', (_label, total, consumed) => {
    expect(consumptionRate(consumption(total, consumed))).toBeNull();
  });

  it.each([
    [CONSUMPTION_MIN_SAMPLE, CONSUMPTION_MIN_SAMPLE, 1],
    [10, 0, 0],
    [10, 5, 0.5],
    [8, 2, 0.25],
  ])('rates %i videos with %i consumed as %f', (total, consumed, expected) => {
    expect(consumptionRate(consumption(total, consumed))).toBeCloseTo(expected);
  });
});

describe('consumptionLevel', () => {
  it.each<[string, number, number, ConsumptionLevel]>([
    ['below the minimum sample', 2, 2, 'unknown'],
    ['nothing consumed', 10, 0, 'low'],
    ['just below the medium threshold', 100, 19, 'low'],
    ['exactly at the medium threshold', 100, 20, 'medium'],
    ['just below the high threshold', 100, 49, 'medium'],
    ['exactly at the high threshold', 100, 50, 'high'],
    ['everything consumed', 10, 10, 'high'],
  ])('classifies %s as %s', (_label, total, consumed, expected) => {
    expect(consumptionLevel(consumption(total, consumed))).toBe(expected);
  });
});

describe('consumptionTooltip', () => {
  it.each<[string, ChannelConsumption, string]>([
    [
      'a rated channel',
      consumption(12, 8),
      `Often read: you read 8 of 12 videos in the last ${CONSUMPTION_WINDOW_DAYS} days`,
    ],
    [
      'a rated channel on a young subscription',
      consumption(10, 1, true),
      'Rarely read: you read 1 of 10 videos since you subscribed',
    ],
  ])('names the level and the counts for %s', (_label, input, expected) => {
    expect(consumptionTooltip(input)).toBe(expected);
  });

  it('never quotes a percentage, since the ring already is one', () => {
    expect(consumptionTooltip(consumption(12, 8))).not.toMatch(/%/);
  });

  it.each<[string, ChannelConsumption, string]>([
    [
      'no videos at all',
      consumption(0, 0),
      `Not rated yet: no videos in the last ${CONSUMPTION_WINDOW_DAYS} days`,
    ],
    [
      'a single video',
      consumption(1, 1),
      `Not rated yet: only 1 video in the last ${CONSUMPTION_WINDOW_DAYS} days, ` +
        `and it takes ${CONSUMPTION_MIN_SAMPLE} to rate a channel`,
    ],
    [
      'a young subscription below the sample',
      consumption(2, 0, true),
      'Not rated yet: only 2 videos since you subscribed, ' +
        `and it takes ${CONSUMPTION_MIN_SAMPLE} to rate a channel`,
    ],
  ])('explains why %s leaves the ring unrated', (_label, input, expected) => {
    expect(consumptionTooltip(input)).toBe(expected);
  });
});
