import type { MetadataRoute } from 'next';

import { FULL_WEBSITE_URL } from '@/constants';

export const dynamic = 'force-static';

/**
 * Crawlers only discover /sitemap.xml if something points at it —
 * robots.txt is that pointer. API routes serve JSON/streams rather
 * than pages, so keep crawlers out of them; dashboard routes need no
 * rule because they redirect to sign-in for anonymous requests.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: '/api/',
    },
    sitemap: `${FULL_WEBSITE_URL}/sitemap.xml`,
  };
}
