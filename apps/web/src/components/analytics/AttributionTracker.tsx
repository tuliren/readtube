'use client';

import { useUser } from '@clerk/nextjs';
import { track } from '@vercel/analytics';
import { useEffect, useRef } from 'react';

import { trackGoogleAdsSignupConversion } from '@/lib/analytics/googleAds';
import {
  SignupAttributionResponse,
  deriveAttributionSource,
  isWithinSignupAttributionWindow,
} from '@/lib/analytics/signupAttribution';
import {
  UtmParams,
  clearStoredUtmParams,
  getAttributionHandledUser,
  getStoredUtmParams,
  setAttributionHandledUser,
} from '@/lib/analytics/utmParams';

function markHandled(userId: string): void {
  setAttributionHandledUser(userId);
  clearStoredUtmParams();
}

async function submitAttribution(utmParams: UtmParams, userId: string): Promise<void> {
  const response = await fetch('/api/attribution', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(utmParams),
  });
  if (!response.ok) {
    throw new Error(`Attribution request failed with status ${response.status}`);
  }

  const result = (await response.json()) as SignupAttributionResponse;
  if (result.status === 'recorded') {
    // Vercel caps a custom event at 2 properties (see lib/analytics/events.ts),
    // so the full UTM set lives only in the database row.
    track('signed_up', {
      source: deriveAttributionSource(utmParams),
      landing_page: utmParams.landing_page ?? 'unknown',
    });
    trackGoogleAdsSignupConversion();
  }

  // Every response status means the attribution was handled (recorded,
  // already recorded, or not applicable), so this browser never needs to
  // submit for this user again.
  markHandled(userId);
}

/**
 * Sends locally stored first-touch attribution to the backend once the
 * visitor is signed in. Because the landing page is always captured,
 * localStorage nearly always holds data, so the per-user handled flag (not an
 * empty store) is what makes this a no-op on subsequent page loads.
 */
export function AttributionTracker() {
  const { user } = useUser();
  const submitting = useRef(false);

  useEffect(() => {
    if (user == null || submitting.current) {
      return;
    }
    if (getAttributionHandledUser() === user.id) {
      return;
    }
    const utmParams = getStoredUtmParams();
    if (utmParams == null || Object.keys(utmParams).length === 0) {
      return;
    }

    // The server would reject accounts past the attribution window anyway;
    // skipping here just saves the round trip for established users.
    if (user.createdAt != null && !isWithinSignupAttributionWindow(user.createdAt, new Date())) {
      markHandled(user.id);
      return;
    }

    submitting.current = true;
    submitAttribution(utmParams, user.id).catch(() => {
      // Leave the stored params in place and retry on a later page load.
      submitting.current = false;
    });
  }, [user]);

  return null;
}
