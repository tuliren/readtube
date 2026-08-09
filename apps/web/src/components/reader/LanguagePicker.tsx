'use client';

import { HelpCircle, Languages } from 'lucide-react';
import Link from 'next/link';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { TARGET_LANGUAGES } from '@/lib/language/names';

interface Props {
  /** Current selection. null = "Original" (the source-language row). */
  value: string | null;
  onChange: (next: string | null) => void;
  /** Hide the picker when only one option is meaningful (e.g. public
   *  mode, where Original is the only thing the route returns). */
  disabled?: boolean;
}

const ORIGINAL_VALUE = '__original__';

/**
 * Tiny dropdown that lets the reader switch the displayed
 * summary/article language. "Original" maps to language=null in the
 * URL (handled by parseLanguageQuery on the server).
 *
 * Built on the shared Radix Select (`@/components/ui/select`) so the
 * option list is a themed popover instead of the browser-native menu.
 */
export default function LanguagePicker({ value, onChange, disabled = false }: Props) {
  return (
    <div className="inline-flex items-center gap-1.5">
      <Select
        disabled={disabled}
        value={value ?? ORIGINAL_VALUE}
        onValueChange={(next) => onChange(next === ORIGINAL_VALUE ? null : next)}
      >
        <SelectTrigger
          aria-label="Language"
          className="h-auto w-auto gap-1.5 bg-background px-2 py-1.5 text-xs shadow-none"
        >
          <Languages aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <SelectValue />
        </SelectTrigger>
        <SelectContent align="end">
          <SelectItem className="text-xs" value={ORIGINAL_VALUE}>
            Original
          </SelectItem>
          {TARGET_LANGUAGES.map((lang) => (
            <SelectItem key={lang.code} className="text-xs" value={lang.code}>
              {lang.nativeName}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <TooltipProvider delayDuration={200}>
        <Tooltip>
          <TooltipTrigger asChild>
            {/* Pure trigger — clicking does nothing; the tooltip's
                inline link is the actionable target. type=button so it
                doesn't accidentally submit a form. */}
            <button
              type="button"
              aria-label="What does the language picker do?"
              className="rounded p-0.5 text-muted-foreground hover:text-foreground focus:text-foreground focus:outline-none"
            >
              <HelpCircle className="h-3.5 w-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent
            side="bottom"
            align="end"
            sideOffset={10}
            className="max-w-[180px] text-left"
          >
            Set your default reader language in{' '}
            <Link href="/settings" className="underline underline-offset-2 hover:text-white">
              Settings
            </Link>
            . The picker only changes the current video.
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
}

/**
 * Convert a target language to the `?language=` query string fragment
 * (without the leading `?` or `&`). null → `language=original`.
 *
 * The literal "original" matters: the reader picker is always
 * authoritative, so when the user picks Original we have to explicitly
 * say so. Sending no param would let the server fall through to the
 * user's `preferred_language` setting, which would translate against
 * the user's stated picker choice.
 */
export function languageQueryFragment(target: string | null): string {
  return `language=${encodeURIComponent(target ?? 'original')}`;
}
