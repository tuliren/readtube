/**
 * Google Ads conversion tracking. The Google tag (gtag.js) is injected
 * site-wide by `GoogleAdsTag` in the production deployment; conversion
 * events fire from client components via `window.gtag`. Campaign
 * context lives in MARKETING.md.
 */
export const GOOGLE_ADS_TAG_ID = 'AW-18390610665';

// The "ReadTube sign-up" conversion action in the Google Ads account.
const SIGNUP_CONVERSION_SEND_TO = `${GOOGLE_ADS_TAG_ID}/4gm1CLemouMcEOnlqcFE`;

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}

/**
 * Reports a signup conversion to Google Ads. A no-op when the Google
 * tag is not loaded (dev, preview deployments, ad blockers), so
 * callers can invoke it unconditionally.
 */
export function trackGoogleAdsSignupConversion(): void {
  if (typeof window === 'undefined' || window.gtag == null) {
    return;
  }
  window.gtag('event', 'conversion', { send_to: SIGNUP_CONVERSION_SEND_TO });
}
