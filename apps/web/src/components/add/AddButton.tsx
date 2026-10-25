'use client';

import { Plus } from 'lucide-react';

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

export const ADD_BUTTON_HINT = 'Add a channel, video, or playlist';

interface Props {
  onClick: () => void;
  /**
   * - `icon`: ghost icon button with the same box as the neighboring
   *   sidebar toolbar icons (search, collapse), set apart only by its
   *   blue glyph. For the sidebar header and the collapsed rail.
   * - `hero`: large call to action for empty-state panels.
   */
  variant?: 'icon' | 'hero';
  /** Visible label for the `hero` variant. */
  label?: string;
  /** Where the `icon` variant's tooltip opens. */
  tooltipSide?: 'right' | 'bottom';
  className?: string;
}

/**
 * The unified "Add" trigger. Every variant opens the same dialog,
 * which detects whether the pasted link is a channel, a video, or a
 * playlist, so there is one obvious place to start from.
 */
export default function AddButton({
  onClick,
  variant = 'icon',
  label = 'Add',
  tooltipSide = 'bottom',
  className,
}: Props) {
  if (variant === 'icon') {
    // Own provider: the sidebar header sits outside the nav's
    // TooltipProvider, and a nested provider is harmless inside it.
    return (
      <TooltipProvider delayDuration={300}>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={onClick}
              aria-label={ADD_BUTTON_HINT}
              className={cn(
                'shrink-0 rounded-md p-1.5 text-blue-600 hover:bg-accent hover:text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:text-blue-400 dark:hover:text-blue-300',
                className
              )}
            >
              <Plus className="h-4 w-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent side={tooltipSide}>{ADD_BUTTON_HINT}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-blue-600 px-6 py-3 text-base font-semibold text-white shadow-sm hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2',
        className
      )}
    >
      <Plus className="h-5 w-5 shrink-0" />
      {label}
    </button>
  );
}
