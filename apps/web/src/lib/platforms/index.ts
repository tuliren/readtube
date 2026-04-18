import { VideoPlatformType } from '@readtube/database';

import { VideoPlatform } from './base';
import { BilibiliPlatform } from './bilibili';
import { YouTubePlatform } from './youtube';

export { VideoPlatform } from './base';
export type { PlatformTranscriptResult } from './base';
export { YouTubePlatform } from './youtube';
export { BilibiliPlatform } from './bilibili';
export type { VideoSnapshot } from './types';

const PLATFORMS: readonly VideoPlatform[] = [new YouTubePlatform(), new BilibiliPlatform()];

const PLATFORMS_BY_TYPE: Record<VideoPlatformType, VideoPlatform> = PLATFORMS.reduce(
  (acc, p) => {
    acc[p.type] = p;
    return acc;
  },
  {} as Record<VideoPlatformType, VideoPlatform>
);

/**
 * Resolve the platform instance for a user-supplied URL or bare id.
 * Returns null if no platform recognizes the input.
 */
export function detectPlatform(input: string): VideoPlatform | null {
  return PLATFORMS.find((p) => p.matchesUrl(input)) ?? null;
}

/**
 * Resolve the platform instance for an already-persisted video from
 * its `source_type`. Throws if the enum value has no matching class
 * — that would indicate a missing Platform subclass for a new enum
 * variant, which is a code bug we want to surface loudly.
 */
export function getPlatformByType(type: VideoPlatformType): VideoPlatform {
  const platform = PLATFORMS_BY_TYPE[type];
  if (platform == null) {
    throw new Error(`No VideoPlatform implementation for VideoPlatformType=${type}`);
  }
  return platform;
}

/**
 * Infer a VideoPlatformType from a bare platform `source_id` (no URL,
 * just the id stored in the Video row). Used by /videos/[videoId]
 * routes where the URL carries only the source_id and the lookup
 * needs to scope to the owning platform.
 *
 * Bilibili BV ids have a fixed "BV" prefix + 10 alphanumerics;
 * YouTube ids are 11 URL-safe chars. The shapes don't overlap so a
 * single pattern check is sufficient.
 */
export function detectPlatformTypeFromSourceId(sourceId: string): VideoPlatformType | null {
  if (sourceId == null || typeof sourceId !== 'string') {
    return null;
  }
  const trimmed = sourceId.trim();
  if (/^BV[A-Za-z0-9]{10}$/.test(trimmed)) {
    return VideoPlatformType.BILIBILI;
  }
  if (/^[\w-]{11}$/.test(trimmed)) {
    return VideoPlatformType.YOUTUBE;
  }
  return null;
}
