import { Check } from 'lucide-react';

import { cn } from '@/lib/utils';

/**
 * The round check mark that mirrors a card's pick. Decorative: the
 * card's full-size button carries the state for assistive tech.
 * `overlay` sits on a thumbnail; `plain` on the card background.
 */
export default function SelectionCheck({
  selected,
  variant,
  className,
}: {
  selected: boolean;
  variant: 'overlay' | 'plain';
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        'flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition-colors',
        selected
          ? 'border-blue-600 bg-blue-600 text-white'
          : variant === 'overlay'
            ? 'border-white bg-black/30 text-transparent group-hover:bg-black/50'
            : 'border-muted-foreground/40 bg-background text-transparent group-hover:border-muted-foreground/70',
        className
      )}
    >
      <Check className="h-3.5 w-3.5" />
    </span>
  );
}
