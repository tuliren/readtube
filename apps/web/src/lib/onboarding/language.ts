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

const INTL_LANGUAGE_NAMES = new Intl.DisplayNames(['en'], { type: 'language' });

/**
 * The English name for a primary language code, or null when there is
 * none. Chips always spell the language out: the curated names come
 * first, then the runtime's full ISO 639 list (`bg` → "Bulgarian").
 * Both give back the code itself when they don't know it, which counts
 * as no name.
 */
export function languageDisplayName(code: string): string | null {
  const curated = languageNameForPrompt(code);
  if (curated !== code) {
    return curated;
  }
  try {
    const name = INTL_LANGUAGE_NAMES.of(code);
    return name == null || name.toLowerCase() === code.toLowerCase() ? null : name;
  } catch {
    // Not a well-formed language tag.
    return null;
  }
}

export interface LanguageOption {
  code: string;
  label: string;
  count: number;
}

/**
 * The language chips to offer for a set of suggestions: one per language
 * present, most common first, with ties broken by label so the order is
 * stable. Suggestions whose language is unknown, or has no name to show,
 * only appear under "All".
 */
export function languageOptions(items: { language: string | null }[]): LanguageOption[] {
  const counts = new Map<string, number>();
  for (const item of items) {
    if (item.language == null) {
      continue;
    }
    counts.set(item.language, (counts.get(item.language) ?? 0) + 1);
  }
  const options: LanguageOption[] = [];
  counts.forEach((count, code) => {
    const label = languageDisplayName(code);
    if (label != null) {
      options.push({ code, label, count });
    }
  });
  return options.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
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
