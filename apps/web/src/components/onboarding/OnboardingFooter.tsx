'use client';

import { Link2, Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { selectionLabel } from '@/lib/onboarding/copy';

interface Props {
  channelCount: number;
  videoCount: number;
  submitting: boolean;
  onContinue: () => void;
  /** Opens the Add dialog for users who already know what they want. */
  onAddLink: () => void;
}

const ADD_LINK_HINT = 'Paste a YouTube or Bilibili link to a video, playlist, or channel.';
const EMPTY_HINT =
  'Pick a channel or video, or add your own link. This page goes away once you add something. Until then, your account stays empty.';

/**
 * Sticky bar at the bottom of the onboarding page: how many picks are
 * selected, a button to add a link of the user's own, and the one
 * button that saves every pick. Both actions sit together on the right;
 * tooltips say what the link button does and, while nothing is picked,
 * why the save button is disabled.
 */
export default function OnboardingFooter({
  channelCount,
  videoCount,
  submitting,
  onContinue,
  onAddLink,
}: Props) {
  const empty = channelCount === 0 && videoCount === 0;
  const saveButton = (
    <Button
      onClick={onContinue}
      disabled={empty || submitting}
      className="bg-blue-600 px-5 text-white hover:bg-blue-700"
    >
      {submitting && <Loader2 className="animate-spin" />}
      {empty ? 'Pick something to start' : 'Start reading'}
    </Button>
  );

  return (
    <TooltipProvider delayDuration={200}>
      <div className="sticky bottom-0 z-10 border-t border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-end gap-3 px-4 py-3 sm:px-8">
          <span
            className="mr-auto hidden text-sm text-muted-foreground sm:inline"
            aria-live="polite"
          >
            {selectionLabel(channelCount, videoCount)}
          </span>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline" onClick={onAddLink}>
                <Link2 />
                <span className="hidden sm:inline">Add your own link</span>
                <span className="sm:hidden">Add link</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">{ADD_LINK_HINT}</TooltipContent>
          </Tooltip>
          {empty ? (
            // A disabled button fires no pointer events, so the
            // tooltip hangs off a wrapper that can be hovered and
            // focused instead.
            <Tooltip>
              <TooltipTrigger asChild>
                <span tabIndex={0} className="inline-flex rounded-md">
                  {saveButton}
                </span>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-xs">
                {EMPTY_HINT}
              </TooltipContent>
            </Tooltip>
          ) : (
            saveButton
          )}
        </div>
      </div>
    </TooltipProvider>
  );
}
