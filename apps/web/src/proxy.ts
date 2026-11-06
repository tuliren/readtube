import { clerkMiddleware } from '@clerk/nextjs/server';

import { isProtectedPathname } from '@/lib/protectedRoutes';

/**
 * Only the dashboard route prefixes (`PROTECTED_ROUTE_PREFIXES`, one
 * per top-level segment under `app/(dashboard)`) require a signed-in
 * Clerk session. Every other path passes through, so marketing pages,
 * public share pages (`/p/...`), crawler endpoints, and unknown paths
 * render normally, and a missing page returns a real 404 from
 * `app/not-found.tsx` instead of a sign-in redirect.
 *
 * New authenticated routes stay protected automatically: the coverage
 * test in `lib/__tests__/protectedRoutes.test.ts` fails if a segment
 * under `app/(dashboard)` isn't matched. The dashboard layout's own
 * `auth()` redirect remains as a second guard.
 *
 * `/api(.*)` is not protected here because API handlers self-enforce
 * auth and need to return 401 JSON (not a sign-in HTML redirect) to
 * unauthenticated callers. Cron and Clerk webhook routes also live
 * under /api and use their own secret-based auth.
 */
export default clerkMiddleware(async (auth, req) => {
  if (isProtectedPathname(req.nextUrl.pathname)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    // Skip Next.js internals, the workflow runtime's internal queue
    // endpoint (/.well-known/workflow/...), and all static files.
    // Workflow uses streaming request bodies to post step results to
    // its own handler — routing those through Clerk middleware would
    // consume the body first and cause
    // "Cannot perform ArrayBuffer.prototype.slice on a detached
    //  ArrayBuffer" when the runtime tries to read it. See
    // https://github.com/vercel/workflow/issues/344.
    '/((?!_next|\\.well-known/workflow|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Always run for API routes
    '/(api|trpc)(.*)',
  ],
};
