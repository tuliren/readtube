import { getFileContent } from '@/lib/file';
import { buildHomeMarkdown } from '@/lib/markdown/home';
import { markdownResponse } from '@/lib/markdown/response';
import { buildLlmsFullTxt } from '@/lib/seo/llmsTxt';

// Static copy only (no video bodies), so render once per deploy.
export const dynamic = 'force-static';

/** Homepage markdown plus the terms and privacy policy, in one file. */
export async function GET() {
  const [terms, privacy] = await Promise.all([
    getFileContent('src/legal/terms.md'),
    getFileContent('src/legal/privacy.md'),
  ]);
  return markdownResponse(buildLlmsFullTxt({ home: buildHomeMarkdown(), terms, privacy }), {
    contentType: 'text/plain',
  });
}
