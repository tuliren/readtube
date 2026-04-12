/**
 * Format a video duration (in seconds) for display.
 *
 *   formatDurationSeconds(42)    // "0:42"
 *   formatDurationSeconds(754)   // "12:34"
 *   formatDurationSeconds(3723)  // "1:02:03"
 *   formatDurationSeconds(null)  // null
 *
 * Returns null when the input is null/undefined/negative/non-finite so
 * the caller can decide how to render the missing case (skip the meta
 * pill, render an em dash, etc.) instead of getting back a misleading
 * "0:00".
 */
export function formatDurationSeconds(seconds: number | null | undefined): string | null {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) {
    return null;
  }
  const total = Math.floor(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  const pad = (n: number) => n.toString().padStart(2, '0');
  if (hours > 0) {
    return `${hours}:${pad(minutes)}:${pad(secs)}`;
  }
  return `${minutes}:${pad(secs)}`;
}
