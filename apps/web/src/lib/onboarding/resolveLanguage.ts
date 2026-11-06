import { detectLanguage } from '@/lib/language/detect';

import { primaryLanguage } from './language';

/**
 * Below this many characters franc's guess is closer to noise than
 * signal, so text-only detection gives up and the suggestion shows
 * under "All languages" only. Kept low enough for a bare CJK title,
 * which says a lot in 20 characters.
 */
export const MIN_DETECTION_TEXT_LENGTH = 20;

/**
 * Text-detection results that are near-always franc confusing one
 * language for a close relative. Scots in particular is what franc
 * calls a lot of informal English. Applied to text detection only;
 * a transcript tag is taken at its word.
 */
const DETECTION_CONFUSIONS: Record<string, string> = { sco: 'en' };

/**
 * Values seen in `Transcript.language` that are shaped like language
 * codes but describe the caption track instead: YouTube's `asr`
 * (auto-generated) caption kind, an `ai` marker, and the "no / mixed /
 * undetermined language" codes. Counting these as languages would give
 * the page an "asr" chip.
 */
const NON_LANGUAGE_CODES = new Set(['asr', 'ai', 'auto', 'und', 'mul', 'zxx']);

/** BCP-47-shaped: a 2-3 letter primary subtag plus optional subtags. */
const LANGUAGE_TAG_PATTERN = /^[a-z]{2,3}([-_][a-z0-9]{2,8})*$/i;

/**
 * True when a stored transcript language is a usable language code.
 * Free-form values (a native name like "中文") and track-kind markers
 * are rejected so the caller falls back to text detection.
 */
export function isUsableLanguageTag(raw: string): boolean {
  const tag = raw.trim();
  return LANGUAGE_TAG_PATTERN.test(tag) && !NON_LANGUAGE_CODES.has(primaryLanguage(tag));
}

/**
 * Decide which language a suggested channel or video is in, as a
 * primary subtag (`en`, `zh`, `ja`, …), or null when we can't tell.
 *
 * Transcript languages win (unusable values skipped, see
 * {@link isUsableLanguageTag}): they come from the platform's caption
 * track or from detection over the whole transcript, both far more
 * reliable than a title. The most common one is used, so one
 * translated-caption outlier doesn't flip a channel. Ties go to the
 * first-seen language, and callers pass the newest video first.
 *
 * Without any transcript language, falls back to running detection
 * over `fallbackText` (titles and description), but only when there's
 * enough text for the guess to mean something.
 */
export function resolveContentLanguage(
  transcriptLanguages: (string | null)[],
  fallbackText: string
): string | null {
  const counts = new Map<string, number>();
  for (const raw of transcriptLanguages) {
    if (raw == null || !isUsableLanguageTag(raw)) {
      continue;
    }
    const code = primaryLanguage(raw.trim());
    counts.set(code, (counts.get(code) ?? 0) + 1);
  }
  let best: string | null = null;
  let bestCount = 0;
  counts.forEach((count, code) => {
    if (count > bestCount) {
      best = code;
      bestCount = count;
    }
  });
  if (best != null) {
    return best;
  }

  const text = fallbackText.trim();
  if (text.length < MIN_DETECTION_TEXT_LENGTH) {
    return null;
  }
  const detected = detectLanguage(text);
  if (detected == null) {
    return null;
  }
  const code = primaryLanguage(detected);
  return DETECTION_CONFUSIONS[code] ?? code;
}
