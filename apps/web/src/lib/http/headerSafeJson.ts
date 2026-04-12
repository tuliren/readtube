/**
 * Serialize a value as JSON that's safe to stuff into an HTTP response
 * header. The Fetch spec requires header values to be ByteStrings —
 * codepoints 0–255 only — and the Response constructor throws
 *
 *   TypeError: Cannot convert argument to a ByteString because the
 *   character at index N has a value of 8217 which is greater than 255.
 *
 * the moment a value contains anything outside Latin-1.
 *
 * Real-world inputs regularly contain U+2019 (right single quote, ’),
 * U+2014 (em dash), U+00E9 (é), CJK characters, etc., so the naive
 * `JSON.stringify(...)` blows up the moment a non-ASCII string lands
 * in a header value (e.g. the X-Citations header on /api/inbox/ask).
 *
 * The fix is to escape every codepoint > 0x7F as a `\uXXXX` sequence.
 * Standard JSON allows any character to be written that way, and
 * `JSON.parse` on the client side decodes them transparently — so
 * the client doesn't need a corresponding decoder.
 *
 * Surrogate pairs (codepoints > U+FFFF) are written as the two-unit
 * UTF-16 surrogate pair, which JSON.parse rejoins back into the
 * original character. The regex matches each unit individually so
 * both halves get escaped, preserving the round-trip.
 */
export function headerSafeJson(value: unknown): string {
  return JSON.stringify(value).replace(
    /[\u0080-\uFFFF]/g,
    (ch) => '\\u' + ch.charCodeAt(0).toString(16).padStart(4, '0')
  );
}
