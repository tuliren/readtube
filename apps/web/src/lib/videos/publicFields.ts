import type { VideoPlatformType } from '@readtube/database';

import { getPlatformByType } from '@/lib/platforms';
import {
  UNKNOWN_VIDEO_TITLE,
  YOUTUBE_GENERIC_DESCRIPTION,
} from '@/lib/platforms/youtube/constants';
import { toOneLine } from '@/lib/string';

/**
 * Stored video fields as a public surface (page metadata, structured
 * data) may show them: trimmed, and null when the stored value is
 * blank or a placeholder a degraded scrape left behind. Publishing
 * "Unknown video" or YouTube's site-wide description to search
 * engines is worse than publishing nothing.
 */

/** The video title, or null when it is blank or the placeholder title. */
export function publicVideoTitle(title: string | null | undefined): string | null {
  const value = toOneLine(title);
  return value === UNKNOWN_VIDEO_TITLE ? null : value;
}

/** The channel name, or null when it is blank or the platform's placeholder name. */
export function publicChannelName(
  platform: VideoPlatformType,
  name: string | null | undefined
): string | null {
  const value = toOneLine(name);
  return value === getPlatformByType(platform).placeholderChannelName ? null : value;
}

/** The video's own description on one line, or null when it is blank or YouTube's generic text. */
export function publicVideoDescription(description: string | null | undefined): string | null {
  const value = toOneLine(description);
  return value === YOUTUBE_GENERIC_DESCRIPTION ? null : value;
}
