import { languageNameForPrompt } from './names';

/**
 * Build the leading-position language rule that prepends every summary
 * and article prompt. When `target` is null, fall back to the original
 * "match the transcript" wording — that's how Original rows are
 * generated. When `target` is a BCP-47 code, force the model to write in
 * that language regardless of transcript source. The instruction is
 * phrased as a hard, leading constraint because the longer prompts have
 * historically slipped back into English when the rule was buried at
 * the end.
 */
export function buildLanguageRule(target: string | null): string {
  if (target == null) {
    return `CRITICAL LANGUAGE REQUIREMENT: Every word of your output — every sentence, every bullet, every title — MUST be written in the exact same natural language as the transcript below. Detect the transcript's language from its content and write in THAT language. Do not translate. Do not mix languages. If the transcript is in Chinese, write entirely in Chinese. If Japanese, entirely in Japanese. If Spanish, entirely in Spanish. Apply this rule before anything else below.`;
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
