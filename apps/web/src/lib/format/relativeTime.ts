/**
 * Short absolute date ("Nov 6, 2026"), always in `en-US`. Pass
 * `timeZone: 'UTC'` for the SSR + first-client-render pass: without a
 * fixed zone the server (UTC) and the browser (local) can land on
 * different days near midnight, and the markup would not match.
 */
export function absoluteDate(dateStr: string, timeZone?: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone,
  });
}

/**
 * Compact "3h ago" / "5d ago" label, falling back to an absolute date
 * past 30 days. Pass `now = null` during SSR and the first client
 * render (capture `Date.now()` in an effect after mount) so the server
 * and client markup match; that pass shows a UTC date, and the re-render
 * after mount switches to the relative label (or a local date).
 */
export function relativeTime(dateStr: string, now: number | null): string {
  if (now == null) {
    return absoluteDate(dateStr, 'UTC');
  }
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMinutes < 1) {
    return 'just now';
  }
  if (diffHours < 1) {
    return `${diffMinutes}m ago`;
  }
  if (diffDays < 1) {
    return `${diffHours}h ago`;
  }
  if (diffDays < 30) {
    return `${diffDays}d ago`;
  }
  return absoluteDate(dateStr);
}
