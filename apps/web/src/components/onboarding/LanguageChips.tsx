'use client';

import { ALL_LANGUAGES, type LanguageOption } from '@/lib/onboarding/language';
import { cn } from '@/lib/utils';

interface Props {
  options: LanguageOption[];
  selected: string;
  onSelect: (code: string) => void;
}

/**
 * Single-select language filter for the onboarding suggestions: one
 * chip per language present, then "All languages".
 */
export default function LanguageChips({ options, selected, onSelect }: Props) {
  const chips = [
    ...options.map((option) => ({ code: option.code, label: option.label })),
    { code: ALL_LANGUAGES, label: 'All languages' },
  ];
  return (
    <div role="radiogroup" aria-label="Language" className="flex flex-wrap gap-2">
      {chips.map((chip) => {
        const active = chip.code === selected;
        return (
          <button
            key={chip.code}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onSelect(chip.code)}
            className={cn(
              'rounded-full border px-3 py-1 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
              active
                ? 'border-foreground bg-foreground text-background'
                : 'border-border bg-background text-muted-foreground hover:border-foreground/40 hover:text-foreground'
            )}
          >
            {chip.label}
          </button>
        );
      })}
    </div>
  );
}
