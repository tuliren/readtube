/**
 * Response for an agent-readable markdown (or llms.txt) document.
 * `Vary: Accept` matters because the homepage and video pages serve
 * markdown or HTML from the same URL depending on the Accept header
 * (see the `rewrites()` in next.config.js), so a shared cache must
 * key on it.
 */
export function markdownResponse(
  body: string,
  { status = 200, contentType = 'text/markdown' }: { status?: number; contentType?: string } = {}
): Response {
  return new Response(body, {
    status,
    headers: {
      'Content-Type': `${contentType}; charset=utf-8`,
      Vary: 'Accept',
    },
  });
}
