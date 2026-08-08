/**
 * Shared client/server logic for signup attribution: the whitelist of
 * fields the API accepts, input sanitization, and the new-user window
 * that stops tracked links clicked by established users from being
 * misattributed as their signup source.
 */
import { isExcludedReferrer } from '@/lib/analytics/utmParams';

export const SIGNUP_ATTRIBUTION_FIELDS = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'referrer',
  'landing_page',
] as const;

export type SignupAttributionField = (typeof SIGNUP_ATTRIBUTION_FIELDS)[number];

export type SignupAttributionInput = Partial<Record<SignupAttributionField, string>>;

// Every status means the request was handled and the client should clear its
// locally stored attribution data.
export type SignupAttributionStatus = 'recorded' | 'already_recorded' | 'not_new_user' | 'empty';

export interface SignupAttributionResponse {
  status: SignupAttributionStatus;
}

export const MAX_ATTRIBUTION_VALUE_LENGTH = 512;

// Attribution is only recorded while the account is younger than this window,
// so a tracked link clicked by a long-time user is not misattributed as the
// source of their signup.
export const SIGNUP_ATTRIBUTION_WINDOW_MS = 24 * 60 * 60 * 1000;

// currentHostname is the host serving the request; when provided, same-site
// referrers are dropped in addition to auth-provider ones. The client applies
// the same exclusions at capture time, but re-checking here keeps polluted
// localStorage entries out of the database.
export function sanitizeAttributionInput(
  body: unknown,
  currentHostname?: string
): SignupAttributionInput {
  const result: SignupAttributionInput = {};
  if (body == null || typeof body !== 'object' || Array.isArray(body)) {
    return result;
  }

  const record = body as Record<string, unknown>;
  for (const field of SIGNUP_ATTRIBUTION_FIELDS) {
    const value = record[field];
    if (typeof value === 'string' && value.length > 0) {
      result[field] = value.slice(0, MAX_ATTRIBUTION_VALUE_LENGTH);
    }
  }

  if (result.referrer != null && isExcludedReferrer(result.referrer, currentHostname)) {
    delete result.referrer;
  }
  return result;
}

export function isWithinSignupAttributionWindow(
  userCreatedAt: Date | null | undefined,
  now: Date
): boolean {
  if (userCreatedAt == null) {
    return false;
  }
  return now.getTime() - userCreatedAt.getTime() <= SIGNUP_ATTRIBUTION_WINDOW_MS;
}

/**
 * Collapses the captured attribution into one low-cardinality label for the
 * `signed_up` analytics event: utm_source when present, else the referrer
 * hostname, else 'organic'.
 */
export function deriveAttributionSource(params: SignupAttributionInput): string {
  if (params.utm_source != null && params.utm_source.length > 0) {
    return params.utm_source;
  }
  if (params.referrer != null && params.referrer.length > 0) {
    try {
      return new URL(params.referrer).hostname.replace(/^www\./, '');
    } catch {
      return params.referrer;
    }
  }
  return 'organic';
}
