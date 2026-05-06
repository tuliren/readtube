import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';

/**
 * Routes that do not require a signed-in Clerk session. Everything
 * else is protected by default, so new authenticated routes get
 * coverage automatically instead of relying on each page to remember
 * its own `redirect()` guard.
 *
 * `/api(.*)` is public because API handlers self-enforce auth and
 * need to return 401 JSON (not a sign-in HTML redirect) to
 * unauthenticated callers. Cron and Clerk webhook routes also live
 * under /api and use their own secret-based auth.
 */
const isPublicRoute = createRouteMatcher([
  '/',
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/privacy',
  '/terms',
  '/p/(.*)',
  '/api(.*)',
  '/opengraph-image',
  '/producthunt(.*)',
]);

export default clerkMiddleware(async (auth, req) => {
  if (!isPublicRoute(req)) {
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
