import { trackGoogleAdsSignupConversion } from '@/lib/analytics/googleAds';

type GlobalWithWindow = { window?: unknown };

describe('trackGoogleAdsSignupConversion', () => {
  afterEach(() => {
    delete (globalThis as GlobalWithWindow).window;
  });

  it('reports the conversion through window.gtag', () => {
    const gtag = jest.fn();
    (globalThis as GlobalWithWindow).window = { gtag };

    trackGoogleAdsSignupConversion();

    expect(gtag).toHaveBeenCalledWith('event', 'conversion', {
      send_to: 'AW-18390610665/4gm1CLemouMcEOnlqcFE',
    });
  });

  it.each([
    ['no window (server side)', undefined],
    ['window without the Google tag', {}],
  ])('is a no-op with %s', (_name, windowValue) => {
    if (windowValue != null) {
      (globalThis as GlobalWithWindow).window = windowValue;
    }

    expect(() => trackGoogleAdsSignupConversion()).not.toThrow();
  });
});
