import { STALE_DAYS, isChannelFresh } from '../staleness';

describe('isChannelFresh', () => {
  it('returns false for null (row was never snapshotted)', () => {
    expect(isChannelFresh(null)).toBe(false);
  });

  it('returns true for a checked_at timestamp 1 hour ago', () => {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    expect(isChannelFresh(oneHourAgo)).toBe(true);
  });

  it('returns true for a checked_at exactly 1 day ago', () => {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    expect(isChannelFresh(oneDayAgo)).toBe(true);
  });

  it('returns true just under the STALE_DAYS boundary', () => {
    const justFresh = new Date(Date.now() - (STALE_DAYS * 24 - 1) * 60 * 60 * 1000);
    expect(isChannelFresh(justFresh)).toBe(true);
  });

  it('returns false just past the STALE_DAYS boundary', () => {
    const justStale = new Date(Date.now() - (STALE_DAYS * 24 + 1) * 60 * 60 * 1000);
    expect(isChannelFresh(justStale)).toBe(false);
  });

  it('returns false for a checked_at far in the past', () => {
    expect(isChannelFresh(new Date('2020-01-01'))).toBe(false);
  });
});
