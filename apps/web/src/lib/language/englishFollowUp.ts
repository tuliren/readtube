import { ENGLISH_LANGUAGE_CODE, languageTagsMatch } from './names';

/**
 * Whether a just-generated row is non-English and therefore needs an
 * English sibling, so public share pages (which default to English)
 * have English content for search engines to index.
 *
 * - `target` set: the row is in `target`; follow up unless it's English.
 * - `target` null (Original): the row is in the transcript's source
 *   language. Follow up only when that language is known and not
 *   English. An undetectable source (`null`) is skipped because the
 *   Original prompt falls back to English in that case.
 */
export function needsEnglishFollowUp(
  target: string | null,
  sourceLanguage: string | null
): boolean {
  if (target != null) {
    return !languageTagsMatch(target, ENGLISH_LANGUAGE_CODE);
  }
  if (sourceLanguage == null) {
    return false;
  }
  return !languageTagsMatch(sourceLanguage, ENGLISH_LANGUAGE_CODE);
}
