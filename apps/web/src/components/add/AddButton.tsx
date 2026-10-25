'use client';

import { Plus } from 'lucide-react';

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

export const ADD_BUTTON_HINT = 'Add a channel, video, or playlist';
const SIDEBAR_LABEL = 'Add channel, video, or playlist';

interface Props {
  onClick: () => void;
  /**
   * - `sidebar`: full-width button in its own row under the sidebar
   *   header, so the app name in the header never gets squeezed. Spells
   *   out what it adds, shortening to "Add" when the sidebar is narrow.
   * - `icon`: square icon button for the collapsed 56px rail.
   * - `hero`: large call to action for empty-state panels.
   */
  variant?: 'sidebar' | 'icon' | 'hero';
  /** Visible label for the `hero` variant. */
  label?: string;
  className?: string;
}

/**
 * The unified "Add" trigger. Every variant opens the same dialog,
 * which detects whether the pasted link is a channel, a video, or a
 * playlist, so there is one obvious place to start from.
 */
export default function AddButton({
  onClick,
  variant = 'sidebar',
  label = 'Add',
  className,
}: Props) {
  if (variant === 'icon') {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={onClick}
            aria-label={ADD_BUTTON_HINT}
            className={cn(
              'rounded-md bg-blue-600 p-1.5 text-white shadow-sm hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2',
              className
            )}
          >
            <Plus className="h-4 w-4" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="right">{ADD_BUTTON_HINT}</TooltipContent>
      </Tooltip>
    );
  }

  const hero = variant === 'hero';
  return (
    <button
      type="button"
      onClick={onClick}
      title={hero ? undefined : ADD_BUTTON_HINT}
      aria-label={hero ? undefined : ADD_BUTTON_HINT}
      className={cn(
        'inline-flex shrink-0 items-center justify-center bg-blue-600 font-medium text-white shadow-sm hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2',
        hero
          ? 'gap-2 rounded-lg px-6 py-3 text-base font-semibold'
          : '@container w-full gap-1.5 rounded-md px-3 py-2 text-sm',
        className
      )}
    >
      <Plus className={`shrink-0 ${hero ? 'h-5 w-5' : 'h-4 w-4'}`} />
      {hero ? (
        label
      ) : (
        <>
          <span className="@min-[13.5rem]:hidden">Add</span>
          <span className="hidden @min-[13.5rem]:inline">{SIDEBAR_LABEL}</span>
        </>
      )}
    </button>
  );
}
