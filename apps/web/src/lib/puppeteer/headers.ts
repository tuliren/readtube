export const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// Applied via setExtraHTTPHeaders to ALL requests (navigation, XHR, fetch).
// Upgrade-Insecure-Requests is intentionally excluded: Chromium sends it
// automatically for top-level navigations, and adding it to cross-origin
// XHR/fetch triggers CORS preflights that break third-party widgets whose
// servers don't allow it in Access-Control-Allow-Headers.
export const JS_HTTP_HEADERS: Record<string, string> = {
  'Accept-Language': 'en-US,en;q=0.9',
};
