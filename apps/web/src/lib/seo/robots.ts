/**
 * AI crawlers that get their own explicit group. Each group repeats the
 * default rules, so allowing them (including for model training) is a
 * deliberate, visible decision rather than an accident of `*`. A
 * crawler that matches a named group ignores the `*` group entirely,
 * which is why every group carries the full rule set.
 */
export const AI_CRAWLER_USER_AGENTS = ['GPTBot', 'ClaudeBot', 'Google-Extended', 'CCBot'] as const;

/**
 * Content Signals (contentsignals.org) declare how crawled content may
 * be used: search indexing, AI answers grounded in the page, and model
 * training. `MetadataRoute.Robots` can't emit this directive, which is
 * why robots.txt is served from a route handler.
 */
export const CONTENT_SIGNAL = 'search=yes, ai-input=yes, ai-train=yes';

function buildGroup(userAgent: string): string {
  return [
    `User-agent: ${userAgent}`,
    `Content-Signal: ${CONTENT_SIGNAL}`,
    'Allow: /',
    // API routes serve JSON/streams rather than pages.
    'Disallow: /api/',
  ].join('\n');
}

/**
 * Builds the robots.txt body. Crawlers only discover the sitemap if
 * something points at it, so the `Sitemap:` line is the main job;
 * dashboard routes need no rule because they redirect anonymous
 * requests to sign-in.
 */
export function buildRobotsTxt(siteUrl: string): string {
  const groups = ['*', ...AI_CRAWLER_USER_AGENTS].map(buildGroup);
  return `${[...groups, `Sitemap: ${siteUrl}/sitemap.xml`].join('\n\n')}\n`;
}
