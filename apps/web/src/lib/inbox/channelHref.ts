import { isEmptyString } from '@/lib/string';
import type { ChannelData } from '@/lib/types';

/**
 * Build the sidebar `/inbox` link for a channel. Prefers the `@handle`
 * form when the scraper has captured one — makes the URL readable
 * (`/inbox?channelHandle=%40mkbhd`) and shareable — and falls back to
 * the opaque DB id for channels without a handle.
 */
export function channelInboxHref(channel: Pick<ChannelData, 'id' | 'handle'>): string {
  if (!isEmptyString(channel.handle)) {
    return `/inbox?channelHandle=${encodeURIComponent(channel.handle)}`;
  }
  return `/inbox?channelId=${channel.id}`;
}
