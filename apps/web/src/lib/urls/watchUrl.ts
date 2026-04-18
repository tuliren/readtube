import type { VideoPlatform } from '@/lib/types';

export interface WatchLink {
  /** Canonical watch URL on the source platform. */
  url: string;
  /** Display name of the platform ("YouTube", "Bilibili", ...). */
  platformName: string;
}

/**
 * Build the external "Watch on X" link for a video. Lives on the
 * client side (no Node imports) so the reader component can use it.
 */
export function buildWatchLink(platform: VideoPlatform, sourceId: string): WatchLink {
  switch (platform) {
    case 'BILIBILI':
      return {
        url: `https://www.bilibili.com/video/${sourceId}/`,
        platformName: 'Bilibili',
      };
    case 'YOUTUBE':
    default:
      return {
        url: `https://youtube.com/watch?v=${sourceId}`,
        platformName: 'YouTube',
      };
  }
}
