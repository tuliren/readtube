'use client';

import { useDashboard } from '@/components/dashboard/DashboardContext';
import type { OnboardingSuggestions } from '@/lib/onboarding/types';

import NewUserOnboardingView from './NewUserOnboardingView';
import { useApplyOnboarding } from './useApplyOnboarding';

/**
 * The page a user sees in place of the inbox until they've added
 * anything: suggested channels and videos to pick from, saved in one
 * request. See `NewUserOnboardingView` for the page itself.
 */
export default function NewUserOnboarding({ suggestions }: { suggestions: OnboardingSuggestions }) {
  const { openAdd } = useDashboard();
  const { apply, submitting } = useApplyOnboarding();
  return (
    <NewUserOnboardingView
      suggestions={suggestions}
      onAdd={openAdd}
      onSubmit={(selection) => void apply(selection)}
      submitting={submitting}
    />
  );
}
