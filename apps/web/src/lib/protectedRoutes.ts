/**
 * Top-level URL segments that require a signed-in Clerk session. Each
 * one is a route segment under `app/(dashboard)`; the coverage test in
 * `lib/__tests__/protectedRoutes.test.ts` reads that directory and
 * fails if a new segment is added there without being listed here.
 *
 * Everything else (marketing, legal, public share pages, crawler
 * endpoints, unknown paths) is left open so Next can render it, or
 * render `app/not-found.tsx` with a real 404.
 */
export const PROTECTED_ROUTE_PREFIXES = [
  'channels',
  'inbox',
  'settings',
  'usage',
  'videos',
] as const;

function safeDecode(pathname: string): string {
  try {
    return decodeURIComponent(pathname);
  } catch {
    return pathname;
  }
}

/**
 * True when `pathname` is a protected prefix itself (`/inbox`) or any
 * path below it (`/inbox/`, `/inbox/ask`). A sibling that merely shares
 * the prefix (`/inboxes`) is not protected. The path is percent-decoded
 * first so an encoded segment can't slip past the check.
 */
export function isProtectedPathname(pathname: string): boolean {
  const decoded = safeDecode(pathname);
  return PROTECTED_ROUTE_PREFIXES.some(
    (prefix) => decoded === `/${prefix}` || decoded.startsWith(`/${prefix}/`)
  );
}
