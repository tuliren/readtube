import { FULL_WEBSITE_URL } from '@/constants';
import { buildRobotsTxt } from '@/lib/seo/robots';

export const dynamic = 'force-static';

export function GET(): Response {
  return new Response(buildRobotsTxt(FULL_WEBSITE_URL), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
