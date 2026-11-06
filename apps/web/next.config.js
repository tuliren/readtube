const { withWorkflow } = require('workflow/next');

// Next matches `has` / `missing` values as case-sensitive regexes, but
// media types are case-insensitive (RFC 9110), so spell each letter
// as a two-case character class.
const caseInsensitive = (text) =>
  text.replace(/[a-z]/gi, (c) => `[${c.toLowerCase()}${c.toUpperCase()}]`);
const MARKDOWN_MEDIA_TYPE = caseInsensitive('text/markdown');

// Serve markdown when the Accept header names text/markdown (e.g.
// `text/markdown, text/html;q=0.5`), unless it gives it q=0, which
// means "not acceptable". Browsers never send it, so HTML visitors are
// unaffected.
const ACCEPTS_MARKDOWN = [{ type: 'header', key: 'accept', value: `.*${MARKDOWN_MEDIA_TYPE}.*` }];
const REFUSES_MARKDOWN = [
  {
    type: 'header',
    key: 'accept',
    value: `.*${MARKDOWN_MEDIA_TYPE}(?:\\s*;[^,]*)?\\s*;\\s*[qQ]\\s*=\\s*0(?:\\.0{0,3})?\\s*(?:,.*)?`,
  },
];

// Agent-readable surfaces (see "Agent-readable surfaces" in DESIGN.md).
// These run beforeFiles: `/` and `/p/videos/:videoId` are real pages,
// and afterFiles rewrites only apply when no page matches, so they
// would never fire.
// The video target is a route handler nested under the page,
// app/p/videos/[videoId]/md/route.ts: Next can't route a segment that
// mixes a parameter with a literal suffix (`[videoId].md`), and a
// handler can't share the page's own segment.
const MARKDOWN_REWRITES = [
  { source: '/', has: ACCEPTS_MARKDOWN, missing: REFUSES_MARKDOWN, destination: '/index.md' },
  { source: '/p/videos/:videoId.md', destination: '/p/videos/:videoId/md' },
  {
    source: '/p/videos/:videoId',
    has: ACCEPTS_MARKDOWN,
    missing: REFUSES_MARKDOWN,
    destination: '/p/videos/:videoId/md',
  },
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
    // This Link header replaces the one the markdown handler sets when
    // `/` is served as markdown, so it repeats the canonical.
    {
      source: '/',
      headers: [
        { key: 'Vary', value: 'Accept' },
        {
          key: 'Link',
          value:
            '</>; rel="canonical", </sitemap.xml>; rel="sitemap", </llms.txt>; rel="describedby"; type="text/markdown", </index.md>; rel="alternate"; type="text/markdown"',
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
