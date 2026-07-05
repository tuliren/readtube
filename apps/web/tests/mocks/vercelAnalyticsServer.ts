/**
 * Jest stub for `@vercel/analytics/server`. The real package ships an
 * ESM-only build that Jest's CommonJS runtime can't parse. Our
 * analytics emitter no-ops outside real Vercel deployments (no
 * `VERCEL_ENV` in tests), so `track` is never actually invoked — this
 * stub only needs to make the import resolve.
 */
export function track(): Promise<void> {
  return Promise.resolve();
}
