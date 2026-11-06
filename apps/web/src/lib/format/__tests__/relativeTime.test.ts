import { absoluteDate, relativeTime } from '@/lib/format/relativeTime';

const NOW = Date.parse('2026-06-15T12:00:00Z');
const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

describe('relativeTime', () => {
  it.each([
    { name: 'under a minute', ago: 30 * 1000, expected: 'just now' },
    { name: 'minutes', ago: 5 * MINUTE_MS, expected: '5m ago' },
    { name: 'hours', ago: 3 * HOUR_MS, expected: '3h ago' },
    { name: 'days', ago: 4 * DAY_MS, expected: '4d ago' },
  ])('labels $name', ({ ago, expected }) => {
    expect(relativeTime(new Date(NOW - ago).toISOString(), NOW)).toBe(expected);
  });

  it('falls back to a date past 30 days', () => {
    const date = new Date(NOW - 45 * DAY_MS).toISOString();
    expect(relativeTime(date, NOW)).toBe(absoluteDate(date));
  });

  it('shows the UTC date before mount, whatever the local zone', () => {
    // 23:30 UTC is already the next day east of UTC.
    expect(relativeTime('2026-11-05T23:30:00Z', null)).toBe('Nov 5, 2026');
  });
});
