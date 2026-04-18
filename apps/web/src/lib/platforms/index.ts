import { VideoPlatformType } from '@readtube/database';

import { VideoPlatform } from './base';
import { BilibiliPlatform } from './bilibili/platform';
import { YouTubePlatform } from './youtube/platform';

export { VideoPlatform } from './base';
export type { PlatformTranscriptResult } from './base';
export { YouTubePlatform } from './youtube/platform';
export { BilibiliPlatform } from './bilibili/platform';
export type { ChannelSnapshot, SnapshotVideo, VideoSnapshot } from './types';

// Order matters: `detectPlatform` and `detectPlatformTypeFromSourceId`
// both return the FIRST platform whose matcher accepts the input.
// Today no URL host or id pattern overlaps between the entries, so the
// ordering is cosmetic. If you add a platform whose patterns could
// collide with an existing one (e.g. both accept a bare 11-char id),
// list the more specific matcher first — or tighten the matchers so
// they're mutually exclusive.
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
 * Each platform owns its id-shape check via `matchesSourceId`; this
 * function iterates the registry in order and returns the first hit.
 * Today YouTube (11 URL-safe chars) and Bilibili (`BV` + 10 alphas)
 * don't overlap, but see the `PLATFORMS` comment above if you add a
 * platform whose ids might collide.
 */
export function detectPlatformTypeFromSourceId(sourceId: string): VideoPlatformType | null {
  if (sourceId == null || typeof sourceId !== 'string') {
    return null;
  }
  const trimmed = sourceId.trim();
  if (trimmed.length === 0) {
    return null;
  }
  return PLATFORMS.find((p) => p.matchesSourceId(trimmed))?.type ?? null;
}
