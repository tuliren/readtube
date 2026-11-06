/**
 * Path of a video's public, unauthenticated reader page. This is the
 * canonical URL search engines index, so the sitemap, the page's own
 * canonical tag, and the agent-readable surfaces all build it here.
 */
export function publicVideoPath(sourceId: string): string {
  return `/p/videos/${encodeURIComponent(sourceId)}`;
}

/**
 * Path of the markdown rendition of {@link publicVideoPath}. Served by
 * a `next.config.js` rewrite to `app/p/videos/[videoId]/md/route.ts`.
 */
export function publicVideoMarkdownPath(sourceId: string): string {
  return `${publicVideoPath(sourceId)}.md`;
}
