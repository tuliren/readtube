// User-visible fallbacks used anywhere a YouTube scrape or feed fails
// to expose a title or channel name. Extracted so the wording and
// casing stay consistent across every scrape path — search, inbox,
// reader, library, subtitle fetchers, etc.
export const UNKNOWN_VIDEO_TITLE = 'Unknown video';
export const UNKNOWN_CHANNEL_NAME = 'Unknown channel';

/**
 * YouTube's site-wide (English) meta description. Degraded watch
 * pages served to some datacenter IPs carry it in place of the
 * video's own; the scraper no longer reads meta descriptions, and
 * this identifies rows stored before that.
 */
export const YOUTUBE_GENERIC_DESCRIPTION =
  'Enjoy the videos and music you love, upload original content, and share it all with friends, family, and the world on YouTube.';
