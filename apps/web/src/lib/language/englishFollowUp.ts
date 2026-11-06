import { ENGLISH_LANGUAGE_CODE, languageTagsMatch } from './names';

export function isEnglish(tag: string): boolean {
  return languageTagsMatch(tag, ENGLISH_LANGUAGE_CODE);
}

/** The slot an English follow-up generates into. */
export interface EnglishFollowUpSlot {
  /** `en`, or null for the Original. */
  language: string | null;
  /** Source language for the run's prompt; set only for an Original. */
  sourceLanguage: string | null;
}

/**
 * Where to generate the English sibling of a just-started run, or null
 * when the run is already English. Public share pages default to
 * English and fall back English → Original, so either an `en` row or
 * an English Original gives them English content to index.
 *
 * `sourceLanguage` is the transcript's language (null when
 * undetectable).
 *
 * - English target: already English, so null.
 * - Original (`target` null): the row is in the source language, so
 *   `en` when that is known and not English. An English or
 *   undetectable source gives null (the Original prompt falls back to
 *   English when the source is undetectable).
 * - Non-English target over an English source: the Original. It is
 *   already English, and filling the Original slot means a later
 *   Original request is a cache hit. An `en` row is never reused as
 *   the Original, so generating one would cost a second run later.
 * - Non-English target over any other source: `en`.
 */
export function englishFollowUpSlot(
  target: string | null,
  sourceLanguage: string | null
): EnglishFollowUpSlot | null {
  const sourceIsEnglish = sourceLanguage != null && isEnglish(sourceLanguage);
  if (target != null) {
    if (isEnglish(target)) {
      return null;
    }
    if (sourceIsEnglish) {
      return { language: null, sourceLanguage };
    }
    return { language: ENGLISH_LANGUAGE_CODE, sourceLanguage: null };
  }
  if (sourceLanguage == null || sourceIsEnglish) {
    return null;
  }
  return { language: ENGLISH_LANGUAGE_CODE, sourceLanguage: null };
}
