/**
 * Reader-page target languages. The set is intentionally small and curated;
 * extend it when there's a real user request rather than dumping the
 * entire BCP-47 universe into a dropdown. Each entry is a BCP-47 code
 * paired with the English-language human name used in prompts and the
 * native name shown in the picker.
 */
export interface TargetLanguage {
  code: string;
  englishName: string;
  nativeName: string;
}

export const TARGET_LANGUAGES: readonly TargetLanguage[] = [
  { code: 'en', englishName: 'English', nativeName: 'English' },
  { code: 'zh', englishName: 'Chinese', nativeName: '中文' },
  { code: 'ja', englishName: 'Japanese', nativeName: '日本語' },
  { code: 'ko', englishName: 'Korean', nativeName: '한국어' },
  { code: 'es', englishName: 'Spanish', nativeName: 'Español' },
  { code: 'fr', englishName: 'French', nativeName: 'Français' },
  { code: 'de', englishName: 'German', nativeName: 'Deutsch' },
  { code: 'pt', englishName: 'Portuguese', nativeName: 'Português' },
  { code: 'ru', englishName: 'Russian', nativeName: 'Русский' },
  { code: 'it', englishName: 'Italian', nativeName: 'Italiano' },
];

const TARGET_LANGUAGE_MAP = new Map(TARGET_LANGUAGES.map((l) => [l.code, l]));

/**
 * Return the curated entry for a BCP-47 code, or null when the code is
 * not on our short list. Callers should still be able to send any code to
 * the model — the prompt builder falls back to the raw code as the human
 * name when this lookup misses.
 */
export function findTargetLanguage(code: string): TargetLanguage | null {
  return TARGET_LANGUAGE_MAP.get(code) ?? null;
}

/**
 * Resolve a BCP-47 code to a human-readable English name suitable for
 * dropping into a prompt. Falls back to the raw code so unknown languages
 * still produce a coherent instruction (the model handles "fr-CA" fine).
 */
export function languageNameForPrompt(code: string): string {
  return findTargetLanguage(code)?.englishName ?? code;
}
