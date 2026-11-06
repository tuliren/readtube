import { AI_CRAWLER_USER_AGENTS, CONTENT_SIGNAL, buildRobotsTxt } from '@/lib/seo/robots';

const SITE_URL = 'https://www.example.com';

/** Splits the body into groups keyed by their `User-agent` value. */
function parseGroups(body: string): Map<string, string[]> {
  const groups = new Map<string, string[]>();
  for (const block of body.trim().split('\n\n')) {
    const [first, ...rest] = block.split('\n');
    const match = /^User-agent: (.+)$/.exec(first);
    if (match != null) {
      groups.set(match[1], rest);
    }
  }
  return groups;
}

describe('buildRobotsTxt', () => {
  const body = buildRobotsTxt(SITE_URL);
  const groups = parseGroups(body);

  it.each(['*', ...AI_CRAWLER_USER_AGENTS])(
    'gives "%s" a group that allows the site, blocks the API, and declares content signals',
    (userAgent) => {
      expect(groups.get(userAgent)).toEqual([
        `Content-Signal: ${CONTENT_SIGNAL}`,
        'Allow: /',
        'Disallow: /api/',
      ]);
    }
  );

  it.each(['search=yes', 'ai-input=yes', 'ai-train=yes'])('signals %s', (signal) => {
    expect(CONTENT_SIGNAL).toContain(signal);
  });

  it('points crawlers at the sitemap', () => {
    expect(body).toContain(`\nSitemap: ${SITE_URL}/sitemap.xml\n`);
  });

  it('ends with a single trailing newline', () => {
    expect(body.endsWith('xml\n')).toBe(true);
  });
});
