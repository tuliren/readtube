import {
  CONSUMPTION_MIN_SAMPLE,
  type ChannelConsumption,
  type ConsumptionLevel,
  consumptionLevel,
  consumptionRate,
  consumptionTooltip,
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
  it.each<[string, ChannelConsumption, string]>([
    ['a full sample', consumption(20, 15), 'Often read: you read 15 of the 20 most recent videos'],
    [
      'a channel shorter than the sample',
      consumption(8, 1),
      'Rarely read: you read 1 of the 8 most recent videos',
    ],
  ])('names the level and the counts for %s', (_label, input, expected) => {
    expect(consumptionTooltip(input)).toBe(expected);
  });

  it('never quotes a percentage, since the ring already is one', () => {
    expect(consumptionTooltip(consumption(20, 15))).not.toMatch(/%/);
  });

  it.each<[string, ChannelConsumption, string]>([
    ['no videos at all', consumption(0, 0), 'Not rated yet: this channel has no videos'],
    [
      'a single video',
      consumption(1, 1),
      `Not rated yet: this channel has only 1 video, and it takes ${CONSUMPTION_MIN_SAMPLE} to rate one`,
    ],
    [
      'two videos',
      consumption(2, 0),
      `Not rated yet: this channel has only 2 videos, and it takes ${CONSUMPTION_MIN_SAMPLE} to rate one`,
    ],
  ])('explains why %s leaves the ring unrated', (_label, input, expected) => {
    expect(consumptionTooltip(input)).toBe(expected);
  });
});
