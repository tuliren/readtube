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
  // Chinese is split by script subtag (BCP-47 standard: Hans / Hant)
  // because the model writes meaningfully different output for each.
  // zh-CN / zh-SG also resolve to Simplified, zh-TW / zh-HK / zh-MO to
  // Traditional — see normalizeLanguageTag for the region → script
  // collapse used during cache matching.
  { code: 'zh-Hans', englishName: 'Chinese (Simplified)', nativeName: '简体中文' },
  { code: 'zh-Hant', englishName: 'Chinese (Traditional)', nativeName: '繁體中文' },
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

// Wider fallback dictionary used by `languageNameForPrompt` for codes
// that aren't in the curated picker list. Source-language detection
// (`franc` → BCP-47 collapse) emits codes from a much wider set than
// the picker offers — most importantly bare `zh` for Chinese (script
// is ambiguous when detected from text) and a long tail of languages
// the picker doesn't translate to but transcripts may still be in.
// Falling through to the raw code (e.g. "zh", "ar") in a prompt
// reads as a typo to the model and leaves room for misinterpretation,
// so resolve to plain English names where we know them.
const SOURCE_LANGUAGE_NAMES: Record<string, string> = {
  zh: 'Chinese',
  ar: 'Arabic',
  hi: 'Hindi',
  vi: 'Vietnamese',
  th: 'Thai',
  tr: 'Turkish',
  pl: 'Polish',
  nl: 'Dutch',
  sv: 'Swedish',
  no: 'Norwegian',
  da: 'Danish',
  fi: 'Finnish',
  cs: 'Czech',
  el: 'Greek',
  he: 'Hebrew',
  id: 'Indonesian',
  ms: 'Malay',
  uk: 'Ukrainian',
  ro: 'Romanian',
  hu: 'Hungarian',
  fa: 'Persian',
  bn: 'Bengali',
  ta: 'Tamil',
  te: 'Telugu',
  ur: 'Urdu',
};

/**
 * Resolve a BCP-47 code to a human-readable English name suitable for
 * dropping into a prompt. Tries the curated picker list first, then
 * the wider source-language fallback dictionary, then falls back to
 * the raw code so unknown languages still produce a coherent
 * instruction (the model handles "fr-CA" fine).
 */
export function languageNameForPrompt(code: string): string {
  const direct = findTargetLanguage(code);
  if (direct != null) {
    return direct.englishName;
  }
  return SOURCE_LANGUAGE_NAMES[code.toLowerCase()] ?? code;
}

// Three-letter ISO 639-3 → two-letter ISO 639-1 collapse for codes the
// YouTube transcript fetcher might emit (some platforms surface
// macrolanguage codes like `cmn` for Chinese). Kept inline rather than
// pulling iso-639-3 here because that package is ESM-only and would
// drag the franc dep into call sites that don't need detection.
const ISO_6393_TO_1: Record<string, string> = {
  cmn: 'zh',
  yue: 'zh',
  eng: 'en',
  spa: 'es',
  fra: 'fr',
  deu: 'de',
  jpn: 'ja',
  kor: 'ko',
  por: 'pt',
  rus: 'ru',
  ita: 'it',
};

// Chinese region subtags → script the region predominantly writes in.
// Anything not listed here keeps script as null (ambiguous).
const ZH_REGION_TO_SCRIPT: Record<string, 'hans' | 'hant'> = {
  cn: 'hans',
  sg: 'hans',
  my: 'hans',
  tw: 'hant',
  hk: 'hant',
  mo: 'hant',
};

/**
 * Normalize a language tag for cross-source comparison. The picker
 * sends curated BCP-47 codes (`en`, `zh-Hans`, `zh-Hant`), but stored
 * values come from many sources: the YouTube subtitle fetcher uses
 * BCP-47 region/script tags (`zh-Hans`, `zh-CN`, `zh-TW`, `fr-CA`),
 * franc returns ISO 639-3 macrolanguage codes (`cmn`, `eng`), and
 * user-typed values are unconstrained.
 *
 * Output:
 * - For Chinese: `zh-hans`, `zh-hant`, or `zh` (ambiguous — primary
 *   subtag only, no script signal).
 * - For everything else: the lowercased primary subtag, with known
 *   3-letter codes collapsed to their 2-letter equivalents. Region
 *   subtags are dropped (no `fr-ca` distinction — French is French).
 */
export function normalizeLanguageTag(code: string): string {
  const lower = code.toLowerCase();
  const parts = lower.split('-');
  const primary = ISO_6393_TO_1[parts[0]] ?? parts[0];

  if (primary === 'zh') {
    for (const sub of parts.slice(1)) {
      if (sub === 'hans' || sub === 'hant') {
        return `zh-${sub}`;
      }
      const fromRegion = ZH_REGION_TO_SCRIPT[sub];
      if (fromRegion != null) {
        return `zh-${fromRegion}`;
      }
    }
    return 'zh';
  }
  return primary;
}

/**
 * Compare two language tags for "this content is in that language."
 * Direct match after normalization, plus the special case where one
 * side is ambiguous Chinese (`zh` with no script signal): an ambiguous
 * value matches either `zh-Hans` or `zh-Hant`. Used by the cache
 * helper to decide whether the Original row can satisfy a target
 * request.
 */
export function languageTagsMatch(a: string, b: string): boolean {
  const na = normalizeLanguageTag(a);
  const nb = normalizeLanguageTag(b);
  if (na === nb) {
    return true;
  }
  if (na === 'zh' && (nb === 'zh-hans' || nb === 'zh-hant')) {
    return true;
  }
  if (nb === 'zh' && (na === 'zh-hans' || na === 'zh-hant')) {
    return true;
  }
  return false;
}
