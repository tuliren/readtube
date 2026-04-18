const { withWorkflow } = require('workflow/next');

/** @type {import('next').NextConfig} */
module.exports = withWorkflow({
  transpilePackages: ['@readtube/lib'],
  // Required so Next doesn't bundle Chromium when using Puppeteer on Vercel.
  // See https://vercel.com/guides/deploying-puppeteer-with-nextjs-on-vercel
  serverExternalPackages: ['@sparticuz/chromium', 'puppeteer-core'],
  // Needed in this monorepo so Next includes the workspace @sparticuz/chromium
  // binary in the deploy artifact.
  outputFileTracingRoot: require('path').join(__dirname, '../../'),
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
