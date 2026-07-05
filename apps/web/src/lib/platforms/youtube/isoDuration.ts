/**
 * Parses ISO-8601 duration (e.g. "PT1H2M3S", "PT45S") into seconds.
 * Returns null if the input is missing or malformed.
 *
 * Shared by the watch-page scrape (`<meta itemprop="duration">`) and
 * the Data API (`contentDetails.duration`) — both emit this format.
 */
export function parseIsoDurationSeconds(iso: string | null | undefined): number | null {
  if (iso == null) {
    return null;
  }
  const m = iso.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  if (m == null) {
    return null;
  }
  const hours = m[1] != null ? parseInt(m[1], 10) : 0;
  const mins = m[2] != null ? parseInt(m[2], 10) : 0;
  const secs = m[3] != null ? parseInt(m[3], 10) : 0;
  const total = hours * 3600 + mins * 60 + secs;
  return total > 0 ? total : null;
}
