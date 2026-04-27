// Slugify a string for use as a downloadable filename stem (no
// extension). Preserves Unicode letters/numbers so non-Latin titles
// (CJK, Cyrillic, Arabic, etc.) survive instead of collapsing to
// nothing and falling through to the default fallback.
//
// Built via `new RegExp` because the `u` flag in a regex literal
// requires an es6+ tsconfig target and this project still compiles
// to es5.
const DROP_RE = new RegExp('[^\\p{L}\\p{N}\\s_-]', 'gu');

const MAX_LENGTH = 80;
const FALLBACK = 'export';

export function filenameSlug(input: string): string {
  const slug = input
    .toLowerCase()
    .trim()
    .replace(DROP_RE, '')
    .replace(/[\s_]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_LENGTH)
    .replace(/-+$/g, '');
  return slug.length > 0 ? slug : FALLBACK;
}
