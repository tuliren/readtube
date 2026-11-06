import { buildHomeMarkdown } from '@/lib/markdown/home';
import { markdownResponse } from '@/lib/markdown/response';

// Built from static marketing copy, so render once per deploy.
export const dynamic = 'force-static';

/**
 * Markdown rendition of the homepage. Also serves `/` when the request
 * sends `Accept: text/markdown`, via a `beforeFiles` rewrite in
 * next.config.js.
 */
export function GET() {
  return markdownResponse(buildHomeMarkdown());
}
