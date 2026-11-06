import { ENGLISH_LANGUAGE_CODE, normalizeLanguageTag } from '@/lib/language/names';

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

/**
 * The name of a primary language code in that language itself
 * (`zh` → "中文", `de` → "Deutsch"), or null when there is none. A new
 * user looking for content they can read scans for their own language's
 * name, so chips use the endonym rather than an English name or a code.
 * `Intl.DisplayNames` gives back the code itself when it doesn't know
 * it, which counts as no name.
 */
export function languageDisplayName(code: string): string | null {
  try {
    const name = new Intl.DisplayNames([code], { type: 'language' }).of(code);
    if (name == null || name.toLowerCase() === code.toLowerCase()) {
      return null;
    }
    // Many languages lowercase their own name ("español", "български");
    // a chip reads as a label, so start it with a capital.
    return name.charAt(0).toLocaleUpperCase(code) + name.slice(1);
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
 * present that has a name in `names`, most common first, with ties
 * broken by code so the order is stable. (Not by label: labels are in
 * many scripts, and collating across scripts can differ between the
 * server and the browser.) Suggestions whose language is unknown, or has
 * no name to show, only appear under "All".
 */
export function languageOptions(
  items: { language: string | null }[],
  names: Record<string, string>
): LanguageOption[] {
  const counts = new Map<string, number>();
  for (const item of items) {
    if (item.language == null) {
      continue;
    }
    counts.set(item.language, (counts.get(item.language) ?? 0) + 1);
  }
  const options: LanguageOption[] = [];
  counts.forEach((count, code) => {
    const label = names[code];
    if (label != null) {
      options.push({ code, label, count });
    }
  });
  return options.sort(
    (a, b) => b.count - a.count || (a.code < b.code ? -1 : a.code > b.code ? 1 : 0)
  );
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
