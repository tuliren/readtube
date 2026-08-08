import {
  MAX_ATTRIBUTION_VALUE_LENGTH,
  SIGNUP_ATTRIBUTION_WINDOW_MS,
  deriveAttributionSource,
  isWithinSignupAttributionWindow,
  sanitizeAttributionInput,
} from '@/lib/analytics/signupAttribution';

describe('sanitizeAttributionInput', () => {
  it.each([
    ['null body', null, {}],
    ['non-object body', 'utm_source=google', {}],
    ['array body', ['utm_source'], {}],
    ['empty object', {}, {}],
    [
      'valid attribution fields',
      {
        utm_source: 'google',
        utm_medium: 'cpc',
        utm_campaign: 'launch',
        utm_term: 'youtube reader',
        utm_content: 'banner',
        referrer: 'https://news.ycombinator.com/',
        landing_page: '/p/some-article',
      },
      {
        utm_source: 'google',
        utm_medium: 'cpc',
        utm_campaign: 'launch',
        utm_term: 'youtube reader',
        utm_content: 'banner',
        referrer: 'https://news.ycombinator.com/',
        landing_page: '/p/some-article',
      },
    ],
    [
      'unknown keys dropped',
      { utm_source: 'google', evil_key: 'x', user_id: 'someone-else' },
      { utm_source: 'google' },
    ],
    [
      'non-string and empty values dropped',
      { utm_source: 42, utm_medium: '', referrer: { url: 'x' }, utm_campaign: 'ok' },
      { utm_campaign: 'ok' },
    ],
    [
      'auth provider referrer dropped',
      { referrer: 'https://accounts.google.com/', landing_page: '/inbox' },
      { landing_page: '/inbox' },
    ],
  ])('sanitizes %s', (_name, body, expected) => {
    expect(sanitizeAttributionInput(body)).toEqual(expected);
  });

  it.each([
    [
      'same-site referrer dropped when the request hostname is known',
      { utm_source: 'google', referrer: 'https://www.read.tube/pricing' },
      { utm_source: 'google' },
    ],
    [
      'auth subdomain referrer dropped',
      { referrer: 'https://clerk.read.tube/v1/oauth_callback', landing_page: '/' },
      { landing_page: '/' },
    ],
    [
      'external referrer kept',
      { referrer: 'https://news.ycombinator.com/item?id=1' },
      { referrer: 'https://news.ycombinator.com/item?id=1' },
    ],
    [
      'non-url referrer from the query param kept',
      { referrer: 'partner-site' },
      { referrer: 'partner-site' },
    ],
  ])('with hostname, %s', (_name, body, expected) => {
    expect(sanitizeAttributionInput(body, 'www.read.tube')).toEqual(expected);
  });

  it('truncates overly long values', () => {
    const longValue = 'a'.repeat(MAX_ATTRIBUTION_VALUE_LENGTH + 100);
    const result = sanitizeAttributionInput({ referrer: longValue });
    expect(result.referrer).toHaveLength(MAX_ATTRIBUTION_VALUE_LENGTH);
  });
});

describe('isWithinSignupAttributionWindow', () => {
  const now = new Date('2026-08-08T12:00:00Z');

  it.each([
    ['created just now', now, true],
    ['created one hour ago', new Date(now.getTime() - 60 * 60 * 1000), true],
    [
      'created exactly at the window boundary',
      new Date(now.getTime() - SIGNUP_ATTRIBUTION_WINDOW_MS),
      true,
    ],
    ['created past the window', new Date(now.getTime() - SIGNUP_ATTRIBUTION_WINDOW_MS - 1), false],
    ['unknown creation time', null, false],
  ])('returns correct result when %s', (_name, createdAt, expected) => {
    expect(isWithinSignupAttributionWindow(createdAt, now)).toBe(expected);
  });
});

describe('deriveAttributionSource', () => {
  it.each([
    [
      'utm_source when present',
      { utm_source: 'producthunt', referrer: 'https://t.co/x' },
      'producthunt',
    ],
    [
      'referrer hostname without www',
      { referrer: 'https://www.reddit.com/r/youtube/comments/1' },
      'reddit.com',
    ],
    ['non-url referrer as-is', { referrer: 'partner-site' }, 'partner-site'],
    ['organic when nothing captured', { landing_page: '/' }, 'organic'],
    ['organic for empty input', {}, 'organic'],
  ])('derives %s', (_name, params, expected) => {
    expect(deriveAttributionSource(params)).toBe(expected);
  });
});
