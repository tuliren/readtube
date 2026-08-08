import {
  extractUtmParams,
  isAuthProviderReferrer,
  isSameSiteReferrer,
} from '@/lib/analytics/utmParams';

describe('isSameSiteReferrer', () => {
  it.each([
    ['same hostname', 'https://www.read.tube/pricing', 'www.read.tube', true],
    ['www vs bare domain', 'https://www.read.tube/', 'read.tube', true],
    ['bare domain vs www', 'https://read.tube/', 'www.read.tube', true],
    ['auth subdomain', 'https://clerk.read.tube/v1/oauth_callback', 'www.read.tube', true],
    ['external site', 'https://news.ycombinator.com/item?id=1', 'www.read.tube', false],
    ['external site with similar suffix', 'https://notread.tube/', 'read.tube', false],
    ['unparseable referrer', 'not a url', 'www.read.tube', false],
  ])('detects %s', (_name, referrer, currentHostname, expected) => {
    expect(isSameSiteReferrer(referrer, currentHostname)).toBe(expected);
  });
});

describe('isAuthProviderReferrer', () => {
  it.each([
    ['google oauth consent screen', 'https://accounts.google.com/o/oauth2/v2/auth', true],
    ['apple sign in', 'https://appleid.apple.com/auth/authorize', true],
    ['microsoft login', 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize', true],
    ['clerk development instance', 'https://verified-hoki-77.accounts.dev/sign-in', true],
    ['external site', 'https://news.ycombinator.com/item?id=1', false],
    // github.com hosts real referral links (readmes, profiles), so it is
    // deliberately not treated as an auth provider.
    ['github', 'https://github.com/some-org/some-repo', false],
    ['unparseable referrer', 'not a url', false],
  ])('detects %s', (_name, referrer, expected) => {
    expect(isAuthProviderReferrer(referrer)).toBe(expected);
  });
});

describe('extractUtmParams', () => {
  it.each([
    [
      'utm params from the query string',
      'https://www.read.tube/?utm_source=google&utm_medium=cpc',
      undefined,
      { utm_source: 'google', utm_medium: 'cpc', landing_page: '/' },
    ],
    [
      'mixed-case utm keys lowercased',
      'https://www.read.tube/p/some-article?UTM_Source=newsletter',
      undefined,
      { utm_source: 'newsletter', landing_page: '/p/some-article' },
    ],
    [
      'empty utm values ignored',
      'https://www.read.tube/?utm_source=',
      undefined,
      { landing_page: '/' },
    ],
    [
      'referrer query param wins over document referrer',
      'https://www.read.tube/?referrer=partner-site',
      'https://news.ycombinator.com/',
      { referrer: 'partner-site', landing_page: '/' },
    ],
    [
      'external document referrer captured',
      'https://www.read.tube/pricing',
      'https://news.ycombinator.com/item?id=1',
      { referrer: 'https://news.ycombinator.com/item?id=1', landing_page: '/pricing' },
    ],
    [
      'same-site document referrer ignored',
      'https://www.read.tube/inbox',
      'https://www.read.tube/sign-up',
      { landing_page: '/inbox' },
    ],
    [
      'auth subdomain referrer ignored',
      'https://www.read.tube/inbox',
      'https://clerk.read.tube/v1/oauth_callback',
      { landing_page: '/inbox' },
    ],
    [
      'auth provider referrer ignored',
      'https://www.read.tube/inbox',
      'https://accounts.google.com/',
      { landing_page: '/inbox' },
    ],
    [
      'landing page only for an organic visit',
      'https://www.read.tube/',
      undefined,
      { landing_page: '/' },
    ],
    [
      'utm params combined with external referrer',
      'https://www.read.tube/?utm_source=x',
      'https://t.co/abc',
      { utm_source: 'x', referrer: 'https://t.co/abc', landing_page: '/' },
    ],
  ])('extracts %s', (_name, url, documentReferrer, expected) => {
    expect(extractUtmParams(new URL(url), documentReferrer)).toEqual(expected);
  });
});
