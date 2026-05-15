import { parseScheduledFromHtml } from '../scheduledVideo';

describe('parseScheduledFromHtml', () => {
  it.each([
    [
      'isUpcoming + liveBroadcastDetails.startTimestamp',
      'foo "isUpcoming":true bar "liveBroadcastDetails":{"isLiveNow":false,"startTimestamp":"2026-05-15T10:45:00+00:00"} baz',
      new Date('2026-05-15T10:45:00.000Z'),
    ],
    [
      'isUpcoming + scheduledStartTime unix only',
      'foo "isUpcoming":true bar "scheduledStartTime":"1778841900" baz',
      new Date(1778841900 * 1000),
    ],
    [
      'isUpcoming with whitespace + ISO start',
      'foo "isUpcoming"   :  true bar "liveBroadcastDetails": { "isLiveNow":false,"startTimestamp":"2027-01-01T00:00:00+00:00" } baz',
      new Date('2027-01-01T00:00:00.000Z'),
    ],
  ])('detects scheduled (%s)', (_label, html, expectedStart) => {
    const result = parseScheduledFromHtml(html);
    expect(result.isScheduled).toBe(true);
    expect(result.source).toBe('scrape');
    expect(result.scheduledStartTime?.getTime()).toBe(expectedStart.getTime());
  });

  it('flags upcoming even when no start time is parseable', () => {
    const result = parseScheduledFromHtml('"isUpcoming":true with no other clues');
    expect(result.isScheduled).toBe(true);
    expect(result.scheduledStartTime).toBeNull();
  });

  it.each([
    ['isUpcoming false + isLiveContent false', '"isUpcoming":false bar "isLiveContent":false'],
    ['no upcoming flag at all', 'random html with nothing relevant'],
    [
      'liveBroadcastDetails present without isUpcoming',
      '"liveBroadcastDetails":{"isLiveNow":true}',
    ],
  ])('returns not scheduled (%s)', (_label, html) => {
    const result = parseScheduledFromHtml(html);
    expect(result.isScheduled).toBe(false);
    expect(result.scheduledStartTime).toBeNull();
    expect(result.source).toBe('scrape');
  });
});
