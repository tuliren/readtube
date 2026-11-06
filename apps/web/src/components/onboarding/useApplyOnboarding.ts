'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import { useSWRConfig } from 'swr';

import { onboardingSuccessMessage } from '@/lib/onboarding/copy';
import type { OnboardingResult, OnboardingSelection } from '@/lib/onboarding/types';

const FALLBACK_ERROR = 'Could not save your picks. Please try again.';

/**
 * Submit the onboarding picks, refresh every sidebar cache they touch,
 * and move the user on: to the inbox when they followed a channel
 * (re-rendered in place, since the inbox is where onboarding lives),
 * otherwise to the library their videos went into.
 */
export function useApplyOnboarding() {
  const router = useRouter();
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
        if (result.followedChannels > 0 || result.addedVideos === 0) {
          router.refresh();
        } else {
          router.push('/videos/standalone');
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
    [mutate, router]
  );

  return { apply, submitting };
}
