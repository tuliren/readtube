'use client';

import { Eye } from 'lucide-react';

import { cn } from '@/lib/utils';

interface Props {
  /** What is being previewed, for the accessible name. */
  label: string;
  onClick: () => void;
  /** `overlay` sits on a thumbnail; `plain` on the card background. */
  variant: 'overlay' | 'plain';
  className?: string;
}

/**
 * Opens the onboarding preview. Sits above a card's full-size select
 * button (`z-[2]` over its `z-[1]`), so a click here previews instead
 * of toggling the pick.
 */
export default function PreviewButton({ label, onClick, variant, className }: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Preview ${label}`}
      className={cn(
        'z-[2] inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-full text-xs font-semibold',
        'px-2.5 py-1',
        'transition-colors transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
        variant === 'overlay'
          ? 'bg-black/65 text-white hover:bg-black/80'
          : // Stands out from the card's own hover so it reads as its own button.
            'border border-border bg-background text-foreground shadow-sm hover:border-blue-500 hover:bg-blue-50 hover:text-blue-700 dark:hover:bg-blue-500/15 dark:hover:text-blue-300',
        className
      )}
    >
      <Eye className="h-3.5 w-3.5" />
      Preview
    </button>
  );
}
