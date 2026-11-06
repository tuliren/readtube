import { detectLanguage } from '@/lib/language/detect';

import { primaryLanguage } from './language';

/**
 * Below this many characters franc's guess is closer to noise than
 * signal (a single short title happily reads as Scots or Tagalog), so
 * text-only detection gives up and the suggestion shows under "All
 * languages" only.
 */
export const MIN_DETECTION_TEXT_LENGTH = 40;

/**
 * Decide which language a suggested channel or video is in, as a
 * primary subtag (`en`, `zh`, `ja`, …), or null when we can't tell.
 *
 * Transcript languages win: they come from the platform's caption
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
    if (raw == null || raw.trim() === '') {
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
  return detected == null ? null : primaryLanguage(detected);
}
