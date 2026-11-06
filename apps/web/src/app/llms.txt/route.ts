import { prisma } from '@readtube/database';

import { markdownResponse } from '@/lib/markdown/response';
import { LLMS_TXT_RECENT_READS, buildLlmsTxt, selectRecentReads } from '@/lib/seo/llmsTxt';
import { querySitemapVideos } from '@/lib/sitemap/publicVideoSitemap';

// Generated once per deploy, like app/sitemap.ts: new videos show up
// under "Recent reads" on the next deploy.
export const dynamic = 'force-static';

/** https://llmstxt.org index of the agent-readable pages. */
export async function GET() {
  // Over-fetch so candidates dropped by the latest-transcript re-check
  // (rare) don't leave the list short.
  const rows = await querySitemapVideos(prisma, { take: LLMS_TXT_RECENT_READS * 2 });
  return markdownResponse(buildLlmsTxt(selectRecentReads(rows)), { contentType: 'text/plain' });
}
