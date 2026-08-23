import { extractDurationSecondsFromWatchHtml } from '../videoDuration';

describe('extractDurationSecondsFromWatchHtml', () => {
  it.each([
    [
      'duration microdata',
      '<html><head><meta itemprop="duration" content="PT39M21S"/></head></html>',
      2361,
    ],
    [
      'microdata with hours',
      '<html><head><meta itemprop="duration" content="PT2H5M3S"/></head></html>',
      7503,
    ],
    ['player response lengthSeconds', '<script>var x = {"lengthSeconds":"2361"};</script>', 2361],
    [
      'lengthSeconds with whitespace around the colon',
      '<script>{"lengthSeconds" : "125"}</script>',
      125,
    ],
    [
      'microdata preferred over lengthSeconds',
      '<meta itemprop="duration" content="PT1M40S"/><script>{"lengthSeconds":"999"}</script>',
      100,
    ],
    [
      'malformed microdata falls back to lengthSeconds',
      '<meta itemprop="duration" content="not-a-duration"/><script>{"lengthSeconds":"90"}</script>',
      90,
    ],
  ])('extracts from %s', (_label, html, expected) => {
    expect(extractDurationSecondsFromWatchHtml(html)).toBe(expected);
  });

  it.each([
    ['empty document', ''],
    ['no duration markers', '<html><head><meta name="title" content="A video"/></head></html>'],
    ['zero lengthSeconds', '<script>{"lengthSeconds":"0"}</script>'],
    ['non-numeric lengthSeconds', '<script>{"lengthSeconds":"soon"}</script>'],
  ])('returns null for %s', (_label, html) => {
    expect(extractDurationSecondsFromWatchHtml(html)).toBeNull();
  });
});
