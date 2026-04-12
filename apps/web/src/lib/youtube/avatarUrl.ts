/**
 * Resize a Google User Content avatar URL to a specific pixel size.
 *
 * YouTube channel avatars are hosted on yt3.googleusercontent.com and
 * come with a size parameter like `=s900-c-k-c0x00ffffff-no-rj`.
 * Loading a 900px image for a 20px sidebar avatar is wasteful — this
 * helper rewrites the `=s<N>` token to the requested dimension so the
 * CDN serves a pre-scaled version.
 *
 * If the URL doesn't match the Google User Content pattern (or has
 * no `=s<N>` token), returns the URL unchanged — better to show a
 * slightly-too-large image than nothing.
 */
export function resizeGoogleAvatar(url: string, size: number): string {
  // Match the =sNNN parameter anywhere in the URL's query/fragment,
  // including when it's followed by other dash-separated tokens.
  return url.replace(/=s\d+/, `=s${size}`);
}
