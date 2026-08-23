const { withWorkflow } = require('workflow/next');

/** @type {import('next').NextConfig} */
module.exports = withWorkflow({
  transpilePackages: ['@readtube/lib'],
  // Vercel's workflow runtime auto-generates a step-handler route at
  // /.well-known/workflow/v1/step that pulls in @workflow/world-vercel
  // → @vercel/queue → @vercel/oidc → @vercel/cli-auth → @napi-rs/keyring.
  // The last one ships a native .node binary that Turbopack can't
  // include in ESM chunks ("non-ecmascript placeable asset"), so we
  // mark the whole chain as external — they get required() at runtime
  // from node_modules instead of bundled.
  serverExternalPackages: [
    '@napi-rs/keyring',
    '@vercel/cli-auth',
    '@vercel/oidc',
    '@vercel/queue',
    '@workflow/world-vercel',
  ],
  reactStrictMode: true,
  pageExtensions: ['js', 'jsx', 'md', 'mdx', 'ts', 'tsx'],
  // Expose Vercel's auto-set VERCEL_ENV to client code via the
  // NEXT_PUBLIC_ prefix so isProduction() works in 'use client'
  // components. Used to gate dev-only affordances like the
  // SummaryReader Regenerate buttons.
  env: {
    NEXT_PUBLIC_VERCEL_ENV: process.env.VERCEL_ENV,
  },
  async rewrites() {
    return [
      {
        source: '/s/:slug*',
        destination: '/api/script/:slug*',
      },
    ];
  },
  headers: async () => [
    {
      source: '/(.*)',
      headers: [
        {
          key: 'Content-Security-Policy',
          value: "frame-ancestors 'none';",
        },
        {
          key: 'X-Frame-Options',
          value: 'DENY',
        },
      ],
    },
    // API responses must never be served from the browser's HTTP
    // cache. Without an explicit Cache-Control, 410/404 responses are
    // heuristically cacheable (RFC 9110), and Chrome was observed
    // re-serving a cached 410 from the transcript GET for every
    // subsequent poll of the same URL — the reader then showed "no
    // transcript" forever after a generation completed, because the
    // server never saw the polls. Handlers can still override this
    // per-route if a cacheable API response is ever wanted.
    {
      source: '/api/:path*',
      headers: [
        {
          key: 'Cache-Control',
          value: 'no-store',
        },
      ],
    },
  ],
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
        port: '',
        search: '',
      },
    ],
  },
});
