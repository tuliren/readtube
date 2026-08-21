import { ctaHref } from '@/lib/analytics/ctaLinks';
import { INTERNAL_UTM_MEDIUM, extractUtmParams } from '@/lib/analytics/utmParams';

describe('ctaHref', () => {
  it.each([
    [
      'source and content',
      '/sign-up',
      { source: 'public_video', content: 'create_account' },
      `/sign-up?utm_source=public_video&utm_medium=${INTERNAL_UTM_MEDIUM}&utm_content=create_account`,
    ],
    [
      'source only when content omitted',
      '/sign-up',
      { source: 'landing_hero' },
      `/sign-up?utm_source=landing_hero&utm_medium=${INTERNAL_UTM_MEDIUM}`,
    ],
    [
      'a non-signup destination',
      '/',
      { source: 'public_video', content: 'learn_more' },
      `/?utm_source=public_video&utm_medium=${INTERNAL_UTM_MEDIUM}&utm_content=learn_more`,
    ],
  ])('tags %s', (_name, path, options, expected) => {
    expect(ctaHref(path, options)).toBe(expected);
  });

  // The whole point of the internal medium: a CTA click must not be captured
  // as first-touch signup attribution, so extractUtmParams drops its UTMs.
  it('produces a link whose UTM params are ignored by extractUtmParams', () => {
    const href = ctaHref('/sign-up', { source: 'public_video', content: 'create_account' });
    const url = new URL(href, 'https://www.read.tube');
    expect(extractUtmParams(url)).toEqual({ landing_page: '/sign-up' });
  });
});
