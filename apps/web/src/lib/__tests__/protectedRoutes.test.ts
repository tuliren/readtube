import { readdirSync } from 'fs';
import path from 'path';

import { PROTECTED_ROUTE_PREFIXES, isProtectedPathname } from '@/lib/protectedRoutes';

const DASHBOARD_DIR = path.join(__dirname, '..', '..', 'app', '(dashboard)');

/**
 * Collects the URL segments a directory contributes at the top level.
 * Route groups (`(name)`) don't add a URL segment, so their children
 * are top-level segments too; private folders (`_name`) aren't routes.
 */
function topLevelSegments(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap((entry) => {
      if (entry.name.startsWith('_')) {
        return [];
      }
      if (entry.name.startsWith('(') && entry.name.endsWith(')')) {
        return topLevelSegments(path.join(dir, entry.name));
      }
      return [entry.name];
    });
}

describe('PROTECTED_ROUTE_PREFIXES', () => {
  const segments = topLevelSegments(DASHBOARD_DIR);

  it('finds dashboard route segments to check', () => {
    expect(segments.length).toBeGreaterThan(0);
  });

  it.each(segments)('protects every path under the dashboard segment "%s"', (segment) => {
    expect(isProtectedPathname(`/${segment}`)).toBe(true);
    expect(isProtectedPathname(`/${segment}/nested/path`)).toBe(true);
  });

  it.each(PROTECTED_ROUTE_PREFIXES)('lists "%s", which exists under app/(dashboard)', (prefix) => {
    expect(segments).toContain(prefix);
  });
});

describe('isProtectedPathname', () => {
  it.each([
    ['/inbox', true],
    ['/inbox/', true],
    ['/inbox/ask', true],
    ['/videos/some-id', true],
    ['/settings', true],
    ['/%69nbox', true],
    ['/', false],
    ['/inboxes', false],
    ['/p/videos/some-id', false],
    ['/privacy', false],
    ['/sign-in', false],
    ['/robots.txt', false],
    ['/sitemap.xml', false],
    ['/api/videos', false],
    ['/some-missing-path', false],
    ['/%E0%A4%A', false],
  ])('classifies %s as protected=%s', (pathname, expected) => {
    expect(isProtectedPathname(pathname)).toBe(expected);
  });
});
