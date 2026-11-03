import { ENGLISH_LANGUAGE_CODE, findTargetLanguage } from './names';
import { parseLanguageQuery } from './prompt';

/**
 * Parse a public share page's `?language=` value into the version the
 * URL asks for:
 *   - a curated target code → that code
 *   - `original` → null (the Original, `language IS NULL`)
 *   - missing / empty / unknown code → undefined (no preference; the
 *     share default applies)
 *
 * Unknown codes are treated as "no preference" so a tampered URL
 * still renders the default version instead of leaking the raw code
 * into a query.
 */
export function parseShareLanguage(raw: string | null | undefined): string | null | undefined {
  const parsed = parseLanguageQuery(raw);
  if (parsed.kind === 'original') {
    return null;
  }
  if (parsed.kind === 'target' && findTargetLanguage(parsed.code) != null) {
    return parsed.code;
  }
  return undefined;
}

/**
 * Resolve which language row a public share page serves. The public
 * reader has no language picker, so this single lookup decides the one
 * version a visitor sees — it must never render empty when *some*
 * version exists.
 *
 * Lookup order:
 *   1. `requested` — the language the URL names (`null` = Original).
 *      Skipped when the URL names none (`undefined`).
 *   2. English (`language = 'en'`) — the default for a bare
 *      `/p/videos/[id]` link, which is also the canonical URL search
 *      engines index. Non-English generations queue an English sibling
 *      (see `needsEnglishFollowUp`), so this row usually exists.
 *   3. Original (`language IS NULL`) — the source-language version.
 *      For an English-source video this row is already English.
 *   4. First available by content creation date — final fallback so a
 *      video with none of the above still shows its earliest-generated
 *      translation instead of empty content.
 *
 * `findByLanguage(language)` runs the caller's table-specific READY-row
 * lookup for a fixed language (`null` = Original). `findEarliest()` runs
 * the caller's lookup for the earliest-`generated_at` READY row across
 * all languages.
 */
export async function resolveShareRow<T>(
  requested: string | null | undefined,
  findByLanguage: (language: string | null) => Promise<T | null>,
  findEarliest: () => Promise<T | null>
): Promise<T | null> {
  const defaults: (string | null)[] = [ENGLISH_LANGUAGE_CODE, null];
  const order =
    requested === undefined ? defaults : [requested, ...defaults.filter((l) => l !== requested)];
  for (const language of order) {
    const row = await findByLanguage(language);
    if (row != null) {
      return row;
    }
  }
  return findEarliest();
}
