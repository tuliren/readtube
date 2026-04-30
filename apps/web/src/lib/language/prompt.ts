import { languageNameForPrompt } from './names';

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
 */
export function buildLanguageRule(target: string | null, sourceLanguage?: string | null): string {
  if (target == null) {
    // "Original" — server-detected source language, defaulting to
    // English on inconclusive detection.
    const code = sourceLanguage ?? 'en';
    const name = languageNameForPrompt(code);
    return `CRITICAL LANGUAGE REQUIREMENT: Every word of your output — every sentence, every bullet, every title — MUST be written in ${name}, matching the transcript's source language. Do not translate. Do not mix languages. Do not switch to English (or any other language) for headings, labels, or framing words. Apply this rule before anything else below.`;
  }
  const name = languageNameForPrompt(target);
  return `CRITICAL LANGUAGE REQUIREMENT: Every word of your output — every sentence, every bullet, every title — MUST be written in ${name}, regardless of the transcript's source language. Translate as needed. Do not mix languages. Do not output any text in the transcript's original language. Apply this rule before anything else below.`;
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
