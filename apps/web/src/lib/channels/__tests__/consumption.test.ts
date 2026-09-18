import {
  CONSUMPTION_MIN_SAMPLE,
  CONSUMPTION_WINDOW_DAYS,
  type ChannelConsumption,
  type ConsumptionLevel,
  consumptionFilledBars,
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

describe('consumptionFilledBars', () => {
  it.each<[ConsumptionLevel, number]>([
    ['unknown', 0],
    ['low', 1],
    ['medium', 2],
    ['high', 3],
  ])('fills %i bars for %s', (level, expected) => {
    expect(consumptionFilledBars(level)).toBe(expected);
  });
});

describe('consumptionTooltip', () => {
  it('returns null below the minimum sample', () => {
    expect(consumptionTooltip(consumption(1, 1))).toBeNull();
  });

  it('names the level, the counts, and the rounded percentage', () => {
    expect(consumptionTooltip(consumption(12, 8))).toBe(
      `Often read: you read 8 of 12 videos in the last ${CONSUMPTION_WINDOW_DAYS} days (67%)`
    );
  });

  it('swaps the period for a subscription younger than the window', () => {
    expect(consumptionTooltip(consumption(10, 1, true))).toBe(
      'Rarely read: you read 1 of 10 videos since you subscribed (10%)'
    );
  });
});
