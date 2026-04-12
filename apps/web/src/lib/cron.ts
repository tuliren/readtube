import { timingSafeEqual } from 'node:crypto';

import { isEmptyString } from '@/lib/string';
import { VercelEnv, getVercelEnv } from '@/lib/vercelEnv';

/**
 * Bearer-token verification for cron-driven API routes.
 *
 * In production / preview every request must carry an
 * `Authorization: Bearer <CRON_SECRET>` header that matches the
 * `CRON_SECRET` env var. The token comparison uses
 * `timingSafeEqual` so a mismatch costs the same time regardless of
 * which character differs — protects against timing attacks against
 * the cron endpoint.
 *
 * In local development we skip the check entirely so a developer can
 * `curl http://localhost:3000/api/cron/refresh -X POST` without
 * having to copy the secret out of .env. Production behavior is
 * unchanged because Vercel sets `VERCEL_ENV=production` for prod
 * deploys (and `preview` for branches), and only `development`
 * skips.
 *
 * Returns true if the request is authorized to run the cron, false
 * otherwise. Callers map false → 401.
 */
export function verifyCronRequest(request: Request): boolean {
  // Skip verification entirely in dev — local testing convenience.
  // Vercel auto-injects VERCEL_ENV on every deployment; locally it
  // is undefined and getVercelEnv falls back to DEVELOPMENT.
  if (getVercelEnv(process.env.VERCEL_ENV) === VercelEnv.DEVELOPMENT) {
    return true;
  }

  const secret = process.env.CRON_SECRET;
  if (isEmptyString(secret)) {
    return false;
  }

  const authHeader = request.headers.get('authorization');
  if (authHeader == null || !authHeader.startsWith('Bearer ')) {
    return false;
  }

  const token = authHeader.slice(7);
  try {
    const secretBuf = new TextEncoder().encode(secret);
    const tokenBuf = new TextEncoder().encode(token);
    if (secretBuf.length !== tokenBuf.length) {
      return false;
    }
    return timingSafeEqual(secretBuf, tokenBuf);
  } catch {
    return false;
  }
}
