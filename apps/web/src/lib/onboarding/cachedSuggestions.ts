import { prisma } from '@readtube/database';
import { unstable_cache } from 'next/cache';

import { loadOnboardingSuggestions } from './suggestions';
import type { OnboardingSuggestions } from './types';

/**
 * How long one build of the suggestions is shared. They are the same for
 * every new user and only need to feel recent, while each build costs
 * two queries and a language detection per item. Staleness is safe:
 * saving and previewing re-check eligibility on every request.
 */
const SUGGESTIONS_TTL_SECONDS = 10 * 60;

const cached = unstable_cache(() => loadOnboardingSuggestions(prisma), ['onboarding-suggestions'], {
  revalidate: SUGGESTIONS_TTL_SECONDS,
});

/** The onboarding suggestions, shared across users for a few minutes. */
export function loadCachedOnboardingSuggestions(): Promise<OnboardingSuggestions> {
  return cached();
}
