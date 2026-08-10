import { prisma } from '@readtube/database';
import type { MetadataRoute } from 'next';

import { FULL_WEBSITE_URL } from '@/constants';
import { buildVideoSitemapEntries, querySitemapVideos } from '@/lib/sitemap/publicVideoSitemap';

// Generated once per deploy, at build time. Metadata routes are static
// by default; force-static makes that intent explicit and guards
// against a future edit accidentally introducing a dynamic API and
// silently moving the DB query to request time. New videos appear in
// the sitemap on the next deploy.
export const dynamic = 'force-static';

/**
 * Static marketing/legal pages plus the public video reader pages
 * (/p/videos/[videoId]) that actually resolve — i.e. videos whose
 * latest transcript has READY AI content. Video entries are
 * newest-first and capped; see lib/sitemap/publicVideoSitemap.ts.
 *
 * The static entries carry no lastModified on purpose: the only
 * deterministic timestamp available at build time would be "now",
 * which would churn the sitemap on every deploy.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const start = performance.now();
  const videos = await querySitemapVideos(prisma);
  const videoEntries = buildVideoSitemapEntries(videos);
  // This route renders during `next build`, so this line lands in the
  // Vercel build log — the only per-route timing visibility the build
  // offers. Watch it to catch the sitemap becoming a build bottleneck
  // as the library grows.
  console.log(
    `[sitemap] ${videoEntries.length} video entries (${videos.length} candidates) in ${Math.round(
      performance.now() - start
    )}ms`
  );
  return [
    { url: FULL_WEBSITE_URL },
    { url: `${FULL_WEBSITE_URL}/terms` },
    { url: `${FULL_WEBSITE_URL}/privacy` },
    ...videoEntries,
  ];
}
