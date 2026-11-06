/**
 * Response for an agent-readable markdown document (including
 * `/llms.txt`, which is markdown per llmstxt.org).
 *
 * `Vary: Accept` matters because the homepage and video pages serve
 * markdown or HTML from the same URL depending on the Accept header
 * (see the `rewrites()` in next.config.js), so a shared cache must
 * key on it.
 *
 * `canonicalUrl` names the HTML page this document renders. Each
 * markdown rendition is reachable at more than one URL (the `.md`
 * URL, the rewrite target, and the HTML URL with
 * `Accept: text/markdown`), so the `Link: rel="canonical"` header
 * folds all of them into the HTML page for search engines.
 */
export function markdownResponse(
  body: string,
  { status = 200, canonicalUrl }: { status?: number; canonicalUrl?: string } = {}
): Response {
  const headers: Record<string, string> = {
    'Content-Type': 'text/markdown; charset=utf-8',
    Vary: 'Accept',
  };
  if (canonicalUrl != null) {
    headers.Link = `<${canonicalUrl}>; rel="canonical"`;
  }
  return new Response(body, { status, headers });
}
