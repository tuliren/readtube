import { isEmptyString } from '@/lib/string';

/**
 * Build the canonical URL for a channel. Prefers the `@handle` form
 * when available (`/channels/@mkbhd`) and falls back to the platform
 * `source_id` (`/channels/UCxxx`) when the channel row doesn't carry
 * a handle. Both forms resolve via `resolveChannelSlug`.
 *
 * Handles in the DB are stored inconsistently — some rows include
 * the leading `@`, some don't. Normalize to the `@`-prefixed form
 * before encoding so `resolveChannelSlug` unambiguously routes the
 * slug through its handle branch (otherwise a bare `mkbhd` would
 * fall into the source_id lookup and 404).
 */
export function channelHref(channel: { handle: string | null; sourceId: string }): string {
  if (!isEmptyString(channel.handle)) {
    const handle = channel.handle.startsWith('@') ? channel.handle : `@${channel.handle}`;
    return `/channels/${encodeSlug(handle)}`;
  }
  return `/channels/${encodeSlug(channel.sourceId)}`;
}

/**
 * Percent-encode a path segment, but preserve `@` as-is. `@` is a
 * valid sub-delim in RFC 3986 path segments, and leaving it literal
 * keeps `/channels/@mkbhd` readable in the address bar instead of the
 * uglier `/channels/%40mkbhd`.
 */
function encodeSlug(value: string): string {
  return encodeURIComponent(value).replace(/%40/g, '@');
}
