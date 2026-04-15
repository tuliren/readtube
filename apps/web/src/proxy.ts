import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';

/**
 * Routes that do not require a signed-in Clerk session. Everything
 * else is protected by default, so new authenticated routes get
 * coverage automatically instead of relying on each page to remember
 * its own `redirect()` guard.
 *
 * Notes on the non-obvious entries:
 * - `/videos(.*)` is public because the page decides per-request
 *   whether to show the authenticated reader or redirect anonymous
 *   visitors to the `/p/videos/[sourceId]` public mirror. If the
 *   middleware forced a sign-in redirect here, shared canonical
 *   video links would stop working for logged-out recipients.
 * - `/api(.*)` is public because API handlers self-enforce auth and
 *   need to return 401 JSON (not a sign-in HTML redirect) to
 *   unauthenticated callers. Cron and Clerk webhook routes also
 *   live under /api and use their own secret-based auth.
 */
const isPublicRoute = createRouteMatcher([
  '/',
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/privacy',
  '/terms',
  '/p(.*)',
  '/videos(.*)',
  '/api(.*)',
]);

export default clerkMiddleware(async (auth, req) => {
  if (!isPublicRoute(req)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Always run for API routes
    '/(api|trpc)(.*)',
  ],
};
