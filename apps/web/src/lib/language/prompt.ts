import { languageNameForPrompt } from './names';

function buildProperNameRule(name: string): string {
  return `The only exception is proper names of people, companies, organizations, products, and brands. Keep each name in its original spelling by default. Use a ${name} form of a name only when ${name} readers already know the entity by that form; never coin a translation or transliteration yourself. Whenever you do use a ${name} form, put the original spelling in parentheses right after its first mention.`;
}

/**
 * Build the leading-position language rule that prepends every summary
 * and article prompt. When `target` is a BCP-47 code, force the model
 * to write in that language regardless of transcript source. When
 * `target` is null ("Original"), the caller should pre-detect the
 * transcript's source language server-side (see
 * resolveTranscriptLanguage) and pass it as `sourceLanguage` so the
 * rule can name the language explicitly — leaving the model to detect
 * from the prompt body has historically been unreliable on transcripts
 * with mixed scripts, heavy code-switching, or non-Latin punctuation,
 * and the model would sometimes pick a neighboring language (Spanish
 * for English, Korean for Japanese, etc.). Falls back to English when
 * detection was inconclusive — better a deterministic fallback than
 * gambling on the model's guess.
 *
 * The instruction is phrased as a hard, leading constraint because the
 * longer prompts have historically slipped back into English when the
 * rule was buried at the end.
 *
 * Proper names are carved out explicitly: an unqualified "every word
 * in <language>" made models translate names literally or invent
 * transliterations (an English company name rendered as a word-for-word
 * Chinese phrase), which readers can't map back to the real entity.
 * The original spelling is the default so the carve-out doesn't turn
 * into translating every name; a localized form needs an established
 * one, and it carries the original in parentheses so readers can still
 * identify the entity.
 */
export function buildLanguageRule(target: string | null, sourceLanguage?: string | null): string {
  if (target == null) {
    // "Original" — server-detected source language, defaulting to
    // English on inconclusive detection.
    const code = sourceLanguage ?? 'en';
    const name = languageNameForPrompt(code);
    return `CRITICAL LANGUAGE REQUIREMENT: Every word of your output — every sentence, every bullet, every title — MUST be written in ${name}, matching the transcript's source language. Do not translate. ${buildProperNameRule(name)} Apart from such names, do not mix languages or switch to English (or any other language) for headings, labels, or framing words. Apply this rule before anything else below.`;
  }
  const name = languageNameForPrompt(target);
  return `CRITICAL LANGUAGE REQUIREMENT: Every word of your output — every sentence, every bullet, every title — MUST be written in ${name}, regardless of the transcript's source language. Translate as needed. ${buildProperNameRule(name)} Apart from such names, do not mix languages or output any text in the transcript's original language. Apply this rule before anything else below.`;
}

/**
 * Tagged result of parsing the `?language=` query param.
 *
 *  - `unspecified`: the caller didn't say — fall back to user preference,
 *    then to Original.
 *  - `original`: the caller explicitly asked for the Original row, even
 *    if a user-level preference is set. Maps to `language IS NULL` in
 *    the DB.
 *  - `target`: a specific BCP-47-ish code.
 */
export type LanguageQuery =
  | { kind: 'unspecified' }
  | { kind: 'original' }
  | { kind: 'target'; code: string };

export function parseLanguageQuery(raw: string | null | undefined): LanguageQuery {
  if (raw == null) {
    return { kind: 'unspecified' };
  }
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return { kind: 'unspecified' };
  }
  if (trimmed.toLowerCase() === 'original') {
    return { kind: 'original' };
  }
  return { kind: 'target', code: trimmed };
}
