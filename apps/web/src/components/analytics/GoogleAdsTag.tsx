import Script from 'next/script';

import { GOOGLE_ADS_TAG_ID } from '@/lib/analytics/googleAds';

/**
 * Loads the Google tag (gtag.js) for Google Ads conversion tracking.
 * Only rendered in the production deployment so dev and preview
 * traffic never pollutes the ads account.
 */
export function GoogleAdsTag() {
  if (process.env.VERCEL_ENV !== 'production') {
    return null;
  }

  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${GOOGLE_ADS_TAG_ID}`}
        strategy="afterInteractive"
      />
      <Script id="google-ads-gtag" strategy="afterInteractive">
        {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${GOOGLE_ADS_TAG_ID}');`}
      </Script>
    </>
  );
}
