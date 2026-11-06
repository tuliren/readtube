import {
  ENGLISH_LANGUAGE_CODE,
  languageNameForPrompt,
  normalizeLanguageTag,
} from '@/lib/language/names';

/**
 * Language filtering for the new-user onboarding page. Client-safe (no
 * `franc`): the server resolves each suggestion's language once, and the
 * page filters the list locally when the user switches language chips.
 */

/** Pseudo-language for the "All languages" chip. */
export const ALL_LANGUAGES = 'all';

/** The chip selected when the page first renders. */
export const DEFAULT_ONBOARDING_LANGUAGE = ENGLISH_LANGUAGE_CODE;

/**
 * Collapse a language tag to its primary language (`zh-Hans` → `zh`,
 * `en-US` → `en`, franc's `eng` → `en`). The chips group by language,
 * not by script or region: a new user picking "Chinese" wants both
 * scripts.
 */
export function primaryLanguage(tag: string): string {
  return normalizeLanguageTag(tag.replace(/_/g, '-')).split('-')[0];
}

export interface LanguageOption {
  code: string;
  label: string;
  count: number;
}

/**
 * The language chips to offer for a set of suggestions: one per language
 * present, most common first, with ties broken by label so the order is
 * stable. Suggestions whose language is unknown only appear under "All".
 */
export function languageOptions(items: { language: string | null }[]): LanguageOption[] {
  const counts = new Map<string, number>();
  for (const item of items) {
    if (item.language == null) {
      continue;
    }
    counts.set(item.language, (counts.get(item.language) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([code, count]) => ({ code, label: languageNameForPrompt(code), count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

/** Keep the suggestions in `language`, or all of them for {@link ALL_LANGUAGES}. */
export function filterByLanguage<T extends { language: string | null }>(
  items: T[],
  language: string
): T[] {
  if (language === ALL_LANGUAGES) {
    return items;
  }
  return items.filter((item) => item.language === language);
}
