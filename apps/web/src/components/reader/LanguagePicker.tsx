'use client';

import { ChevronDown, Languages } from 'lucide-react';

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
 * The native `<select>` is given `appearance-none` so we can render a
 * Languages icon on the left and a custom chevron on the right with
 * symmetric vertical padding. The native chevron renders unevenly
 * (more space on top than bottom in most browsers) so we draw our own.
 */
export default function LanguagePicker({ value, onChange, disabled = false }: Props) {
  return (
    <div className="relative inline-flex items-center">
      <Languages
        aria-hidden="true"
        className="pointer-events-none absolute left-2 h-3.5 w-3.5 text-gray-400"
      />
      <select
        aria-label="Language"
        disabled={disabled}
        value={value ?? ORIGINAL_VALUE}
        onChange={(e) => {
          const next = e.target.value;
          onChange(next === ORIGINAL_VALUE ? null : next);
        }}
        className="appearance-none rounded-md border border-gray-200 bg-white py-1.5 pr-7 pl-7 text-xs leading-none text-gray-600 hover:border-gray-300 focus:border-gray-400 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
      >
        <option value={ORIGINAL_VALUE}>Original</option>
        {TARGET_LANGUAGES.map((lang) => (
          <option key={lang.code} value={lang.code}>
            {lang.nativeName}
          </option>
        ))}
      </select>
      <ChevronDown
        aria-hidden="true"
        className="pointer-events-none absolute right-2 h-3.5 w-3.5 text-gray-400"
      />
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
