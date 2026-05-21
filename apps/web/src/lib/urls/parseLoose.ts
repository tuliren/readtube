/**
 * Lenient URL parser used by the input-side extractors (channel,
 * video, playlist). Users routinely paste a URL without the
 * scheme (e.g. `youtube.com/@mreflow`, `youtu.be/dQw4w9WgXcQ`),
 * and `new URL(...)` rejects those. This helper retries with
 * `https://` prepended when the original input lacks a scheme,
 * so all extractors accept both protocol-prefixed and
 * protocol-less URLs through a single call site.
 *
 * Returns null when the input is empty, isn't a string, or
 * can't be parsed even after the retry.
 */
export function parseUrlLoose(input: string): URL | null {
  if (input == null || typeof input !== 'string') {
    return null;
  }
  const trimmed = input.trim();
  if (trimmed.length === 0) {
    return null;
  }
  try {
    return new URL(trimmed);
  } catch {
    // Only retry when the input lacks a scheme. The RFC 3986
    // scheme grammar is `ALPHA *( ALPHA / DIGIT / "+" / "-" / "." ) ":"`.
    if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) {
      return null;
    }
    try {
      return new URL(`https://${trimmed}`);
    } catch {
      return null;
    }
  }
}
