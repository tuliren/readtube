import type { VideoPlatform } from '@/lib/types';

export interface WatchLink {
  /** Canonical watch URL on the source platform. */
  url: string;
  /** Display name of the platform ("YouTube", "Bilibili", ...). */
  platformName: string;
}

// Compile-time exhaustiveness guard: callers switch on VideoPlatform
// and route the `default` case through this helper. TypeScript flags
// any new enum value that isn't explicitly handled — no silent
// fallback to YouTube-shaped URLs.
function assertNeverPlatform(platform: never): never {
  throw new Error(`Unhandled VideoPlatform: ${String(platform)}`);
}

/**
 * Build the external "Watch on X" link for a video. Lives on the
 * client side (no Node imports) so the reader component can use it.
 */
export function buildWatchLink(platform: VideoPlatform, sourceId: string): WatchLink {
  switch (platform) {
    case 'YOUTUBE':
      return {
        url: `https://youtube.com/watch?v=${sourceId}`,
        platformName: 'YouTube',
      };
    case 'BILIBILI':
      return {
        url: `https://www.bilibili.com/video/${sourceId}/`,
        platformName: 'Bilibili',
      };
    default:
      return assertNeverPlatform(platform);
  }
}

/**
 * Build the external channel/space URL for a video's owning channel.
 * YouTube uses `/channel/<UC…>`; Bilibili uses `space.bilibili.com/<mid>`.
 */
export function buildChannelLink(platform: VideoPlatform, channelSourceId: string): WatchLink {
  switch (platform) {
    case 'YOUTUBE':
      return {
        url: `https://www.youtube.com/channel/${channelSourceId}`,
        platformName: 'YouTube',
      };
    case 'BILIBILI':
      return {
        url: `https://space.bilibili.com/${channelSourceId}`,
        platformName: 'Bilibili',
      };
    default:
      return assertNeverPlatform(platform);
  }
}
