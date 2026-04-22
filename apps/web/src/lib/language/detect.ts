import { franc } from 'franc';
import { iso6393To1 } from 'iso-639-3';

/**
 * Detect the natural language of a text and return a BCP-47 code, or null
 * if franc can't decide ('und'). Uses ISO 639-3 internally and maps to the
 * 2-letter BCP-47 codes we use everywhere else (en, zh, ja, etc.). Codes
 * without a 2-letter mapping fall back to the 3-letter form so callers can
 * still persist a stable identifier.
 */
export function detectLanguage(text: string): string | null {
  if (text.trim().length === 0) {
    return null;
  }
  const iso6393 = franc(text);
  if (iso6393 === 'und') {
    return null;
  }
  const iso6391 = iso6393To1[iso6393];
  return iso6391 ?? iso6393;
}
