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
 * Codes shaped like languages that describe no language: YouTube's
 * `asr` (auto-generated) caption kind, an `ai` marker, and the "no /
 * mixed / undetermined language" codes. Counting these as languages
 * would give the page an "asr" chip.
 */
const NON_LANGUAGE_CODES = new Set(['asr', 'ai', 'auto', 'und', 'mul', 'zxx']);

/**
 * A caption-kind prefix on a stored tag (`asr-en`, `ai-zh`): the track
 * kind joined to the real language, which follows it.
 */
const TRACK_KIND_PREFIX = /^(asr|ai|auto)[-_]/i;

/** BCP-47-shaped: a 2-3 letter primary subtag plus optional subtags. */
const LANGUAGE_TAG_PATTERN = /^[a-z]{2,3}([-_][a-z0-9]{2,8})*$/i;

/**
 * The primary language of a stored `Transcript.language`, or null when
 * it names none. A caption-kind prefix is stripped (`asr-en` → `en`);
 * free-form values (a native name like "中文") and bare track markers
 * give null, so the caller falls back to text detection.
 */
export function transcriptTagLanguage(raw: string): string | null {
  const tag = raw.trim().replace(TRACK_KIND_PREFIX, '');
  if (!LANGUAGE_TAG_PATTERN.test(tag)) {
    return null;
  }
  const code = primaryLanguage(tag);
  return NON_LANGUAGE_CODES.has(code) ? null : code;
}

/**
 * Decide which language a suggested channel or video is in, as a
 * primary subtag (`en`, `zh`, `ja`, …), or null when we can't tell.
 *
 * Transcript languages win (unusable values skipped, see
 * {@link transcriptTagLanguage}): they come from the platform's caption
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
    const code = raw == null ? null : transcriptTagLanguage(raw);
    if (code == null) {
      continue;
    }
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
