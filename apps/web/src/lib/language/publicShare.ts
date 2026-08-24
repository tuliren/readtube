import { ENGLISH_LANGUAGE_CODE } from './names';

/**
 * Resolve which language row a public share page serves when the URL
 * names no specific language (a bare `/p/videos/[id]` link, an explicit
 * `?language=original`, or an unknown code). The public reader has no
 * language picker, so this single lookup decides the one version a
 * visitor sees — it must never render empty when *some* version exists.
 *
 * Fallback order:
 *   1. Original (`language IS NULL`) — the canonical, source-language
 *      version and the historical default. For an English-source video
 *      this row is already the English version.
 *   2. English (`language = 'en'`) — when no Original exists (e.g. the
 *      creator only generated translations), prefer English as the most
 *      broadly readable version over an arbitrary other language.
 *   3. First available by content creation date — final fallback so a
 *      video that has neither an Original nor an English row still shows
 *      its earliest-generated translation instead of empty content.
 *
 * `findByLanguage(language)` runs the caller's table-specific READY-row
 * lookup for a fixed language (`null` = Original). `findEarliest()` runs
 * the caller's lookup for the earliest-`generated_at` READY row across
 * all languages.
 */
export async function resolveDefaultShareRow<T>(
  findByLanguage: (language: string | null) => Promise<T | null>,
  findEarliest: () => Promise<T | null>
): Promise<T | null> {
  const original = await findByLanguage(null);
  if (original != null) {
    return original;
  }
  const english = await findByLanguage(ENGLISH_LANGUAGE_CODE);
  if (english != null) {
    return english;
  }
  return findEarliest();
}
