import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';

import { PROTECTED_ROUTE_PREFIXES, isProtectedPathname } from '@/lib/protectedRoutes';

const APP_DIR = path.join(__dirname, '..', '..', 'app');
const DASHBOARD_DIR = path.join(APP_DIR, '(dashboard)');

/**
 * Top-level URL segments that are deliberately public. Every top-level
 * segment under `app/` must be either a protected prefix or listed
 * here, so adding a route anywhere forces a decision about its auth
 * instead of defaulting to public.
 */
const PUBLIC_ROUTE_SEGMENTS = [
  'about',
  // Handlers self-enforce auth so they can return 401 JSON.
  'api',
  'contact',
  'p',
  'privacy',
  'producthunt',
  'robots.txt',
  'sign-in',
  'sign-up',
  'terms',
];

/**
 * Left out of the check. `.well-known/workflow` holds the Workflow
 * runtime's queue handlers, which `next dev` / `next build` generate
 * (gitignored), so the folder exists on some machines and not in a
 * fresh CI checkout. The proxy matcher skips that path entirely, and
 * `.well-known` URIs are public by definition.
 */
const UNCHECKED_SEGMENTS = ['.well-known'];

const ROUTE_FILE = /^(page|route)\.[jt]sx?$/;
// `(.)x`, `(..)x`, `(...)x`, `(..)(..)x`: intercepting routes render at
// the URL of the route they intercept, named after the marker.
const INTERCEPT_MARKER = /^(\(\.{1,3}\))+/;

function isPrivateFolder(name: string): boolean {
  return name.startsWith('_');
}

/** True when `dir` or anything below it is a page or route handler. */
function containsRoute(dir: string): boolean {
  return readdirSync(dir, { withFileTypes: true }).some((entry) => {
    if (entry.isDirectory()) {
      return !isPrivateFolder(entry.name) && containsRoute(path.join(dir, entry.name));
    }
    return ROUTE_FILE.test(entry.name);
  });
}

/**
 * Collects the URL segments a directory contributes at the top level.
 * Route groups (`(name)`) and parallel-route slots (`@name`) don't add
 * a URL segment, so their children are top-level segments too. Private
 * folders (`_name`) and folders with no page or route below them
 * (colocated components, assets) aren't routes.
 */
function topLevelSegments(dir: string): string[] {
  const segments = readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !isPrivateFolder(entry.name))
    .filter((entry) => containsRoute(path.join(dir, entry.name)))
    .flatMap((entry) => {
      const { name } = entry;
      const intercepted = name.replace(INTERCEPT_MARKER, '');
      if (intercepted !== name) {
        return intercepted === '' ? [] : [intercepted];
      }
      if ((name.startsWith('(') && name.endsWith(')')) || name.startsWith('@')) {
        return topLevelSegments(path.join(dir, name));
      }
      return [name];
    });
  return Array.from(new Set(segments)).sort();
}

describe('topLevelSegments', () => {
  let fixtureDir: string;

  beforeAll(() => {
    fixtureDir = mkdtempSync(path.join(tmpdir(), 'app-routes-'));
    const files = [
      '(group)/grouped/page.tsx',
      '(group)/(nested)/deep/page.tsx',
      '@modal/slotted/page.tsx',
      '(.)intercepted/page.tsx',
      'handler/route.ts',
      'dynamic/[id]/page.tsx',
      '_private/hidden/page.tsx',
      'components/Button.tsx',
      'withPrivateOnly/_lib/page.tsx',
    ];
    for (const file of files) {
      const fullPath = path.join(fixtureDir, file);
      mkdirSync(path.dirname(fullPath), { recursive: true });
      writeFileSync(fullPath, '');
    }
  });

  afterAll(() => {
    rmSync(fixtureDir, { recursive: true, force: true });
  });

  it('flattens groups and slots, strips intercept markers, and skips non-route folders', () => {
    expect(topLevelSegments(fixtureDir)).toEqual([
      'deep',
      'dynamic',
      'grouped',
      'handler',
      'intercepted',
      'slotted',
    ]);
  });
});

describe('PROTECTED_ROUTE_PREFIXES', () => {
  const dashboardSegments = topLevelSegments(DASHBOARD_DIR);

  it('finds dashboard route segments to check', () => {
    expect(dashboardSegments.length).toBeGreaterThan(0);
  });

  it.each(dashboardSegments)('protects every path under the dashboard segment "%s"', (segment) => {
    expect(isProtectedPathname(`/${segment}`)).toBe(true);
    expect(isProtectedPathname(`/${segment}/nested/path`)).toBe(true);
  });

  it.each(PROTECTED_ROUTE_PREFIXES)('lists "%s", which exists under app/(dashboard)', (prefix) => {
    expect(dashboardSegments).toContain(prefix);
  });
});

describe('app route coverage', () => {
  const appSegments = topLevelSegments(APP_DIR).filter(
    (segment) => !UNCHECKED_SEGMENTS.includes(segment)
  );

  it.each(appSegments)(
    'classifies the top-level segment "%s" as protected or deliberately public',
    (segment) => {
      const isProtected = isProtectedPathname(`/${segment}`);
      const isPublic = PUBLIC_ROUTE_SEGMENTS.includes(segment);
      expect({ segment, isProtected, isPublic }).toEqual({
        segment,
        isProtected: !isPublic,
        isPublic: !isProtected,
      });
    }
  );

  it.each(PUBLIC_ROUTE_SEGMENTS)('lists "%s" as public, which exists under app/', (segment) => {
    expect(appSegments).toContain(segment);
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
