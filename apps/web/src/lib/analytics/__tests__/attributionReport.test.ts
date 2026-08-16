import {
  type AttributionFunnelInput,
  collapseSource,
  extractHostname,
  groupAttributionRows,
} from '@/lib/analytics/attributionReport';

function makeRow(overrides: Partial<AttributionFunnelInput> = {}): AttributionFunnelInput {
  return {
    utm_source: null,
    utm_medium: null,
    utm_campaign: null,
    utm_term: null,
    utm_content: null,
    referrer: null,
    landing_page: null,
    channels: 0,
    standalone_videos: 0,
    consumed_videos: 0,
    generations: 0,
    ...overrides,
  };
}

describe('extractHostname', () => {
  it.each([
    ['https://news.ycombinator.com/item?id=1', 'news.ycombinator.com'],
    ['http://example.com', 'example.com'],
    ['not a url', null],
    [null, null],
  ])('extracts hostname from %s', (referrer, expected) => {
    expect(extractHostname(referrer)).toBe(expected);
  });
});

describe('collapseSource', () => {
  it.each([
    [{ utm_source: 'google', referrer: 'https://reddit.com/' }, 'google'],
    [{ utm_source: null, referrer: 'https://reddit.com/r/productivity' }, 'reddit.com'],
    [{ utm_source: null, referrer: null }, 'organic'],
    [{ utm_source: null, referrer: 'not a url' }, 'organic'],
  ])('collapses %o to %s', (row, expected) => {
    expect(collapseSource(row)).toBe(expected);
  });
});

describe('groupAttributionRows', () => {
  it('aggregates the funnel per group and sorts by signups descending', () => {
    const rows = [
      makeRow({
        utm_source: 'google',
        utm_medium: 'cpc',
        utm_campaign: 'c1',
        channels: 2,
        consumed_videos: 3,
        generations: 5,
      }),
      makeRow({
        utm_source: 'google',
        utm_medium: 'cpc',
        utm_campaign: 'c1',
        standalone_videos: 1,
      }),
      makeRow({ utm_source: 'google', utm_medium: 'cpc', utm_campaign: 'c1' }),
      makeRow({ referrer: 'https://news.ycombinator.com/item?id=1' }),
    ];

    expect(groupAttributionRows(rows, 'channel')).toEqual([
      { group: 'google / cpc / c1', signups: 3, activated: 2, consumed: 1, generations: 5 },
      {
        group: 'news.ycombinator.com / (none) / (none)',
        signups: 1,
        activated: 0,
        consumed: 0,
        generations: 0,
      },
    ]);
  });

  it.each([
    ['term', makeRow({ utm_term: 'youtube-summarizer' }), 'youtube-summarizer'],
    ['content', makeRow({ utm_content: 'rsa-a' }), 'rsa-a'],
    ['landing', makeRow({ landing_page: '/p/videos/abc' }), '/p/videos/abc'],
    ['campaign', makeRow({ utm_campaign: '202608-google-exp1' }), '202608-google-exp1'],
    ['medium', makeRow({ utm_medium: 'sponsorship' }), 'sponsorship'],
    ['source', makeRow({ utm_source: 'newsletter-x' }), 'newsletter-x'],
    ['term', makeRow(), '(none)'],
  ] as const)('groups by %s', (groupBy, row, expectedGroup) => {
    expect(groupAttributionRows([row], groupBy)).toEqual([
      { group: expectedGroup, signups: 1, activated: 0, consumed: 0, generations: 0 },
    ]);
  });
});
