/** Bilibili's CDN 403s with our Referer and serves http:// URLs; pair with `referrerPolicy="no-referrer"`. */
export function thumbnailSrc(url: string): string {
  return url.replace(/^http:\/\//, 'https://');
}
