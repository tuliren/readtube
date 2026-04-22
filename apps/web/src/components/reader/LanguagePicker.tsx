'use client';

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
 */
export default function LanguagePicker({ value, onChange, disabled = false }: Props) {
  return (
    <select
      aria-label="Language"
      disabled={disabled}
      value={value ?? ORIGINAL_VALUE}
      onChange={(e) => {
        const next = e.target.value;
        onChange(next === ORIGINAL_VALUE ? null : next);
      }}
      className="rounded-md border border-gray-200 bg-white px-2 py-1 text-xs text-gray-600 hover:border-gray-300 focus:border-gray-400 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
    >
      <option value={ORIGINAL_VALUE}>Original</option>
      {TARGET_LANGUAGES.map((lang) => (
        <option key={lang.code} value={lang.code}>
          {lang.nativeName}
        </option>
      ))}
    </select>
  );
}

/**
 * Convert a target language to the `?language=` query string fragment
 * (without the leading `?` or `&`). null → empty string (omitted).
 */
export function languageQueryFragment(target: string | null): string {
  return target == null ? '' : `language=${encodeURIComponent(target)}`;
}
