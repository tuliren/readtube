import { prisma } from '@readtube/database';
import type { NextRequest } from 'next/server';

import { loadVideoMarkdown } from '@/lib/markdown/loadVideoMarkdown';
import { markdownResponse } from '@/lib/markdown/response';

/**
 * Markdown rendition of the public video page. Not linked directly:
 * next.config.js rewrites `/p/videos/:videoId.md`, and
 * `/p/videos/:videoId` requested with `Accept: text/markdown`, to this
 * handler. Honors `?language=` exactly like the HTML page, and 404s
 * exactly when it would.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ videoId: string }> }
) {
  const { videoId } = await params;
  const markdown = await loadVideoMarkdown(
    prisma,
    videoId,
    request.nextUrl.searchParams.get('language')
  );
  if (markdown == null) {
    return markdownResponse('# Not found\n', { status: 404 });
  }
  return markdownResponse(markdown);
}
