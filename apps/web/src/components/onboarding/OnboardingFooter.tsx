'use client';

import { Loader2, Plus } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { selectionLabel } from '@/lib/onboarding/copy';

interface Props {
  channelCount: number;
  videoCount: number;
  submitting: boolean;
  onContinue: () => void;
  /** Opens the Add dialog for users who already know what they want. */
  onAddLink: () => void;
}

/**
 * Sticky bar at the bottom of the onboarding page: how many picks are
 * selected and the one button that saves them all, plus a way out to
 * the Add dialog for a link of the user's own.
 */
export default function OnboardingFooter({
  channelCount,
  videoCount,
  submitting,
  onContinue,
  onAddLink,
}: Props) {
  const empty = channelCount === 0 && videoCount === 0;
  return (
    <div className="sticky bottom-0 z-10 border-t border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-3 px-4 py-3 sm:px-8">
        <Button variant="ghost" size="sm" onClick={onAddLink} className="text-muted-foreground">
          <Plus />
          <span className="hidden sm:inline">Paste a link instead</span>
          <span className="sm:hidden">Add link</span>
        </Button>
        <div className="flex items-center gap-3">
          <span className="hidden text-sm text-muted-foreground sm:inline" aria-live="polite">
            {selectionLabel(channelCount, videoCount)}
          </span>
          <Button
            onClick={onContinue}
            disabled={empty || submitting}
            className="bg-blue-600 px-5 text-white hover:bg-blue-700"
          >
            {submitting && <Loader2 className="animate-spin" />}
            {empty ? 'Pick something to start' : 'Start reading'}
          </Button>
        </div>
      </div>
    </div>
  );
}
