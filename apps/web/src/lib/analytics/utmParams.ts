/**
 * Client-side capture of first-touch attribution: UTM params, the
 * external referrer, and the landing page of the first visit. Values
 * are persisted to localStorage so they survive the Clerk sign-up
 * redirect flow, then submitted to `/api/attribution` once the visitor
 * is signed in (see `AttributionTracker`).
 */
export interface UtmParams {
  [key: string]: string | undefined;

  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
  referrer?: string;
  landing_page?: string;
}

const UTM_KEY = 'readtube_utm_params';
const ATTRIBUTION_HANDLED_KEY = 'readtube_attribution_handled_user';

/**
 * `utm_medium` value carried by on-site call-to-action links (built via
 * `ctaLinks.ts`). It marks a click as internal navigation: `extractUtmParams`
 * drops the UTM params of any link tagged with it, so an on-site button never
 * overwrites the external, first-touch signup attribution or the `signed_up`
 * event. Vercel Web Analytics still records the full URL, so these clicks show
 * up in its UTM breakdown regardless.
 */
export const INTERNAL_UTM_MEDIUM = 'internal';

// Hostnames that only ever appear as OAuth redirect artifacts (the referrer a
// browser reports after an IdP consent screen), never as genuine referral
// sources. github.com is deliberately absent: it hosts real referral links
// (readmes, profiles), so filtering it would erase legitimate traffic.
const AUTH_PROVIDER_HOSTNAMES = new Set([
  'accounts.google.com',
  'appleid.apple.com',
  'login.microsoftonline.com',
  'login.live.com',
]);

function normalizeHostname(hostname: string): string {
  return hostname.replace(/^www\./, '');
}

export function isAuthProviderReferrer(referrer: string): boolean {
  let hostname: string;
  try {
    hostname = new URL(referrer).hostname;
  } catch {
    return false;
  }
  // *.accounts.dev is Clerk's development-instance domain.
  return AUTH_PROVIDER_HOSTNAMES.has(hostname) || hostname.endsWith('.accounts.dev');
}

// Treats a referrer as same-site when it points at the current hostname or a
// related subdomain (e.g. clerk.readtube.io), so internal navigations and
// auth redirects are not recorded as external referrals.
export function isSameSiteReferrer(referrer: string, currentHostname: string): boolean {
  let referrerHostname: string;
  try {
    referrerHostname = new URL(referrer).hostname;
  } catch {
    return false;
  }
  const ref = normalizeHostname(referrerHostname);
  const current = normalizeHostname(currentHostname);
  return ref === current || ref.endsWith(`.${current}`) || current.endsWith(`.${ref}`);
}

// A referrer is excluded from attribution when it is an auth-flow artifact
// rather than a real traffic source. Used by both the client capture and the
// server-side sanitization, so a polluted localStorage entry (e.g. stored by
// an older client) still cannot reach the database.
export function isExcludedReferrer(referrer: string, currentHostname?: string): boolean {
  if (isAuthProviderReferrer(referrer)) {
    return true;
  }
  return currentHostname != null && isSameSiteReferrer(referrer, currentHostname);
}

export function extractUtmParams(url: URL, documentReferrer?: string): UtmParams {
  const params: UtmParams = {};

  const utmParams: Record<string, string> = {};
  for (const key of Array.from(url.searchParams.keys())) {
    const lowerKey = key.toLowerCase();
    if (lowerKey.startsWith('utm_')) {
      const value = url.searchParams.get(key);
      if (value != null && value.length > 0) {
        utmParams[lowerKey] = value;
      }
    }
  }

  // On-site CTAs tag themselves with utm_medium=internal so their clicks
  // surface in Vercel Web Analytics' UTM breakdown. They are funnel steps,
  // not the external source a signup should be attributed to, so their UTM
  // values are dropped here and never reach the first-touch attribution store
  // or the `signed_up` event — keeping the paid-attribution report free of
  // on-site labels like "public_video". The external referrer / landing page
  // below are still captured (and first-touch merging keeps the original).
  if (utmParams.utm_medium !== INTERNAL_UTM_MEDIUM) {
    Object.assign(params, utmParams);
  }

  // Capture the referrer: an explicit query param wins over document.referrer.
  const referrerParam = url.searchParams.get('referrer');
  if (referrerParam != null && referrerParam.length > 0) {
    params.referrer = referrerParam;
  } else if (
    documentReferrer != null &&
    documentReferrer.length > 0 &&
    !isExcludedReferrer(documentReferrer, url.hostname)
  ) {
    params.referrer = documentReferrer;
  }

  // Always captured, so even a fully organic signup (no UTM, no referrer)
  // produces an attribution row instead of being indistinguishable from a
  // signup whose attribution was lost.
  params.landing_page = url.pathname;

  return params;
}

export function storeUtmParams(params: UtmParams): void {
  if (typeof window === 'undefined' || Object.keys(params).length === 0) {
    return;
  }

  try {
    const existingParams = getStoredUtmParams();
    if (existingParams == null) {
      localStorage.setItem(UTM_KEY, JSON.stringify(params));
    } else {
      // First touch wins: params already stored by an earlier visit are more
      // accurate about where the visitor originally came from, so new values
      // only fill gaps.
      const updatedParams = { ...params, ...existingParams };
      localStorage.setItem(UTM_KEY, JSON.stringify(updatedParams));
    }
  } catch {
    // localStorage unavailable (private mode, storage quota); skip capture.
  }
}

export function getStoredUtmParams(): UtmParams | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const storedParams = localStorage.getItem(UTM_KEY);
    if (storedParams == null) {
      return null;
    }
    return JSON.parse(storedParams);
  } catch {
    return null;
  }
}

export function clearStoredUtmParams(): void {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    localStorage.removeItem(UTM_KEY);
  } catch {
    // ignore
  }
}

// Since the landing page is always captured, localStorage almost always holds
// attribution data. This per-user flag is what stops a signed-in user from
// re-submitting it on every page load: once the backend has handled one
// submission for this user, no further requests are sent from this browser.
// Keyed by user id so a second account signing up on the same browser is
// still recorded.
export function getAttributionHandledUser(): string | null {
  if (typeof window === 'undefined') {
    return null;
  }
  try {
    return localStorage.getItem(ATTRIBUTION_HANDLED_KEY);
  } catch {
    return null;
  }
}

export function setAttributionHandledUser(userId: string): void {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    localStorage.setItem(ATTRIBUTION_HANDLED_KEY, userId);
  } catch {
    // ignore
  }
}
