import type { TranscriptSegment } from './types';

// Kedou emits timestamps like "0:0:0,12 --> 0:0:0,74" — hours/minutes
// are not zero-padded and the fractional part is 1–3 digits of
// milliseconds rather than always-3-digit. This regex is tolerant
// enough to also handle standard "00:00:00,000" timestamps.
const TIMESTAMP_LINE = /(\d+):(\d+):(\d+)[,.](\d+)\s*-->\s*(\d+):(\d+):(\d+)[,.](\d+)/;

function toMs(h: string, m: string, s: string, frac: string): number {
  const fracMs = Number.parseInt(frac.padEnd(3, '0').slice(0, 3), 10);
  return (
    Number.parseInt(h, 10) * 3_600_000 +
    Number.parseInt(m, 10) * 60_000 +
    Number.parseInt(s, 10) * 1_000 +
    fracMs
  );
}

/**
 * Parse an SRT document into transcript segments. Tolerant of missing
 * indices, CRLF line endings, and the non-standard timestamp format
 * kedou.life emits (unpadded H/M/S, variable-length ms).
 */
export function parseSrt(srt: string): TranscriptSegment[] {
  const normalized = srt.replace(/\r\n/g, '\n').trim();
  if (normalized.length === 0) {
    return [];
  }

  const segments: TranscriptSegment[] = [];
  for (const block of normalized.split(/\n\s*\n/)) {
    const lines = block.split('\n').map((l) => l.trim());
    // Find the timestamp line. It's usually line 1 (after the index)
    // but callers produce SRT without an index too.
    const tsIdx = lines.findIndex((l) => TIMESTAMP_LINE.test(l));
    if (tsIdx === -1) {
      continue;
    }
    const match = TIMESTAMP_LINE.exec(lines[tsIdx]);
    if (match == null) {
      continue;
    }
    const [, sh, sm, ss, sfrac, eh, em, es, efrac] = match;
    const text = lines
      .slice(tsIdx + 1)
      .join('\n')
      .trim();
    if (text.length === 0) {
      continue;
    }
    segments.push({
      startMs: toMs(sh, sm, ss, sfrac),
      endMs: toMs(eh, em, es, efrac),
      text,
    });
  }
  return segments;
}
