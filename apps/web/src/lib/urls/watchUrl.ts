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
 *
 * When `startSeconds` is provided, appends a platform-appropriate time
 * parameter (both YouTube and Bilibili honor `?t=<seconds>`). Used by
 * the transcript reader so per-paragraph timestamps deep-link into
 * the right spot in the source video.
 */
export function buildWatchLink(
  platform: VideoPlatform,
  sourceId: string,
  startSeconds?: number
): WatchLink {
  switch (platform) {
    case 'YOUTUBE': {
      const base = `https://youtube.com/watch?v=${sourceId}`;
      return {
        url: startSeconds != null ? `${base}&t=${startSeconds}` : base,
        platformName: 'YouTube',
      };
    }
    case 'BILIBILI': {
      const base = `https://www.bilibili.com/video/${sourceId}/`;
      return {
        url: startSeconds != null ? `${base}?t=${startSeconds}` : base,
        platformName: 'Bilibili',
      };
    }
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
