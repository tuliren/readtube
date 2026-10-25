'use client';

import { Plus } from 'lucide-react';

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

export const ADD_BUTTON_HINT = 'Add a channel, video, or playlist';

interface Props {
  onClick: () => void;
  /**
   * - `toolbar`: compact labeled pill for the sidebar header.
   * - `icon`: square icon button for the collapsed 56px rail.
   * - `hero`: large call to action for empty-state panels.
   */
  variant?: 'toolbar' | 'icon' | 'hero';
  /** Visible label for the `toolbar` and `hero` variants. */
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
  variant = 'toolbar',
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
          : 'gap-1 rounded-md py-1 pl-1.5 pr-2.5 text-sm',
        className
      )}
    >
      <Plus className={hero ? 'h-5 w-5' : 'h-4 w-4'} />
      {label}
    </button>
  );
}
