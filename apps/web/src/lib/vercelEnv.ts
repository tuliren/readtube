/**
 * Tiny helper around Vercel's `VERCEL_ENV` env var. Mirrors the same
 * shape used in github.com/lirentu/timeplot so we have one canonical
 * way to ask "are we running in production right now" across both
 * server and client code paths.
 *
 * To make this work on the client we expose `NEXT_PUBLIC_VERCEL_ENV`
 * via next.config.js (or by reading `process.env.VERCEL_ENV` in
 * server code only). Untrusted to hide secrets — purely for UX
 * gating.
 */
export enum VercelEnv {
  PRODUCTION = 'production',
  PREVIEW = 'preview',
  DEVELOPMENT = 'development',
}

export function getVercelEnv(envVar: string | undefined): VercelEnv {
  for (const env of Object.values(VercelEnv)) {
    if (envVar === env) {
      return env;
    }
  }
  return VercelEnv.DEVELOPMENT;
}

/**
 * Convenience for client-side gating. Reads `NEXT_PUBLIC_VERCEL_ENV`
 * which Next.js inlines at build time, so this is safe in client
 * components ("use client").
 */
export function isProduction(): boolean {
  return getVercelEnv(process.env.NEXT_PUBLIC_VERCEL_ENV) === VercelEnv.PRODUCTION;
}
