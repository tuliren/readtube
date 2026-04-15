import { isEmptyString } from '@/lib/string';

/**
 * Build the canonical URL for a channel. Prefers the `@handle` form
 * when available (`/channels/@mkbhd`) and falls back to the platform
 * `source_id` (`/channels/UCxxx`) when the channel row doesn't carry
 * a handle. Both forms resolve via `resolveChannelSlug`.
 */
export function channelHref(channel: { handle: string | null; sourceId: string }): string {
  const slug = !isEmptyString(channel.handle) ? channel.handle : channel.sourceId;
  return `/channels/${encodeURIComponent(slug)}`;
}
