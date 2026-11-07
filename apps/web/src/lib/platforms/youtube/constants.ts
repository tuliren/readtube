// User-visible fallbacks used anywhere a YouTube scrape or feed fails
// to expose a title or channel name. Extracted so the wording and
// casing stay consistent across every scrape path — search, inbox,
// reader, library, subtitle fetchers, etc.
export const UNKNOWN_VIDEO_TITLE = 'Unknown video';
export const UNKNOWN_CHANNEL_NAME = 'Unknown channel';

/**
 * YouTube's site-wide meta description. Degraded watch pages (served
 * to some datacenter IPs) carry this in place of the video's own
 * description, so it must never be stored as one.
 */
export const YOUTUBE_GENERIC_DESCRIPTION =
  'Enjoy the videos and music you love, upload original content, and share it all with friends, family, and the world on YouTube.';
