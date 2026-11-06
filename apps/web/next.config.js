const { withWorkflow } = require('workflow/next');

// Matches an Accept header that asks for markdown (e.g.
// `text/markdown`, `text/markdown, text/html;q=0.5`). Browsers never
// send it, so HTML visitors are unaffected.
const ACCEPTS_MARKDOWN = [{ type: 'header', key: 'accept', value: '(.*)text/markdown(.*)' }];

// Agent-readable surfaces (see "Agent-readable surfaces" in DESIGN.md).
// These run beforeFiles: `/` and `/p/videos/:videoId` are real pages,
// and afterFiles rewrites only apply when no page matches, so they
// would never fire.
const MARKDOWN_REWRITES = [
  { source: '/', has: ACCEPTS_MARKDOWN, destination: '/index.md' },
  { source: '/p/videos/:videoId.md', destination: '/md/videos/:videoId' },
  { source: '/p/videos/:videoId', has: ACCEPTS_MARKDOWN, destination: '/md/videos/:videoId' },
];

/** @type {import('next').NextConfig} */
module.exports = withWorkflow({
  transpilePackages: ['@readtube/lib'],
  // Vercel's workflow runtime auto-generates a handler route at
  // /.well-known/workflow/v1/flow that pulls in @workflow/world-vercel
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
    return {
      beforeFiles: MARKDOWN_REWRITES,
      afterFiles: [
        {
          source: '/s/:slug*',
          destination: '/api/script/:slug*',
        },
      ],
      fallback: [],
    };
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
    // Pages that serve HTML or markdown from one URL depending on the
    // Accept header (see MARKDOWN_REWRITES): caches must key on it.
    // Next's app-page runtime overwrites Vary on HTML responses, so
    // this reliably lands only on the markdown side; see DESIGN.md.
    // The homepage also advertises its machine-readable companions.
    {
      source: '/',
      headers: [
        { key: 'Vary', value: 'Accept' },
        {
          key: 'Link',
          value:
            '</sitemap.xml>; rel="sitemap", </llms.txt>; rel="describedby"; type="text/markdown", </index.md>; rel="alternate"; type="text/markdown"',
        },
      ],
    },
    {
      source: '/p/videos/:videoId',
      headers: [{ key: 'Vary', value: 'Accept' }],
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
