'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import { useSWRConfig } from 'swr';

import { onboardingDestination, onboardingSuccessMessage } from '@/lib/onboarding/copy';
import type { OnboardingResult, OnboardingSelection } from '@/lib/onboarding/types';

const FALLBACK_ERROR = 'Could not save your picks. Please try again.';

/**
 * Submit the onboarding picks, refresh every sidebar cache they touch,
 * and move the user on: to the inbox when they followed a channel,
 * otherwise to the library their videos went into. Onboarding shows on
 * more than one page, so when the destination is the current page it
 * re-renders in place instead.
 */
export function useApplyOnboarding() {
  const router = useRouter();
  const pathname = usePathname();
  const { mutate } = useSWRConfig();
  const [submitting, setSubmitting] = useState(false);

  const apply = useCallback(
    async (selection: OnboardingSelection) => {
      setSubmitting(true);
      try {
        const res = await fetch('/api/onboarding', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(selection),
        });
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as { error?: string };
          toast.error(data.error ?? FALLBACK_ERROR);
          setSubmitting(false);
          return;
        }
        const result = (await res.json()) as OnboardingResult;
        await mutate(
          (key) =>
            typeof key === 'string' &&
            (key === '/api/channels' || key === '/api/playlists' || key.startsWith('/api/videos'))
        );
        toast.success(onboardingSuccessMessage(result));
        // Nothing new (every pick was already added, or none was
        // eligible) also refreshes in place rather than jumping away.
        const destination = onboardingDestination(result);
        if (destination == null || destination === pathname) {
          router.refresh();
        } else {
          router.push(destination);
        }
        // Otherwise leave `submitting` set: the page is about to be
        // replaced, and re-enabling the button would invite a double
        // submit.
        if (result.followedChannels === 0 && result.addedVideos === 0) {
          setSubmitting(false);
        }
      } catch {
        toast.error('Network error. Please check your connection and try again.');
        setSubmitting(false);
      }
    },
    [mutate, pathname, router]
  );

  return { apply, submitting };
}
