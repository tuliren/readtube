'use client';

import { useSearchParams } from 'next/navigation';
import { useEffect } from 'react';

import { extractUtmParams, storeUtmParams } from '@/lib/analytics/utmParams';

/**
 * Captures first-touch attribution (UTM params, external referrer, landing
 * page) into localStorage on every navigation. Mounted globally so the
 * capture works no matter which page the visitor lands on; `storeUtmParams`
 * keeps the earliest values, so later navigations don't overwrite the
 * original source. Must be rendered inside a Suspense boundary because it
 * reads useSearchParams.
 */
export function UtmParamTracker() {
  const searchParams = useSearchParams();

  useEffect(() => {
    if (searchParams == null || typeof window === 'undefined') {
      return;
    }
    const url = new URL(window.location.href);
    const utmParams = extractUtmParams(url, document.referrer);
    if (Object.keys(utmParams).length > 0) {
      storeUtmParams(utmParams);
    }
  }, [searchParams]);

  return null;
}
