/**
 * Token-set Jaccard similarity for short labels (section headings).
 * Lowercases, strips punctuation, splits on whitespace, then
 * |intersection| / |union|. Two empty strings are 1.0 (vacuously
 * identical); a single empty string is 0.0.
 */
export function jaccardSimilarity(a: string, b: string): number {
  const setA = uniqueTokens(a);
  const setB = uniqueTokens(b);
  const sizeA = Object.keys(setA).length;
  const sizeB = Object.keys(setB).length;
  if (sizeA === 0 && sizeB === 0) {
    return 1;
  }
  if (sizeA === 0 || sizeB === 0) {
    return 0;
  }
  let intersection = 0;
  const keys = Object.keys(setA);
  for (let i = 0; i < keys.length; i++) {
    if (setB[keys[i]]) {
      intersection++;
    }
  }
  const union = sizeA + sizeB - intersection;
  return intersection / union;
}

function uniqueTokens(s: string): Record<string, true> {
  const tokens = tokenize(s);
  const out: Record<string, true> = {};
  for (let i = 0; i < tokens.length; i++) {
    out[tokens[i]] = true;
  }
  return out;
}

// Strip ASCII punctuation. Languages without ASCII punctuation still
// tokenize on whitespace; that's fine for the heading-dedup use case
// where most input is short English/Romance noun phrases.
function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[!-/:-@[-`{-~]+/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 0);
}
