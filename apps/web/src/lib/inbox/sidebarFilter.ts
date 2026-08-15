import { rankByMatchScore } from '@/lib/search/matchScore';

import { displayChannelName } from './channelName';

/**
 * Matching rules for the sidebar filter input — one function per
 * navbar item kind so the fields each kind matches on live in one
 * place. All of them drop non-matches and order the rest by match
 * quality (exact > prefix > word > substring, see `matchScore`) with
 * an alphabetical tiebreak.
 */

/**
 * Channels match on the raw name, the emoji-stripped display name
 * (what the sidebar actually renders), and the `@handle`.
 */
export function filterChannels<T extends { name: string; handle: string | null }>(
  channels: T[],
  query: string
): T[] {
  return rankByMatchScore(
    channels,
    query,
    (c) => [c.name, displayChannelName(c.name), c.handle],
    (c) => c.name
  );
}

/**
 * Playlists match on the original platform name and the user's custom
 * rename — the sidebar shows both ("Custom (Original)").
 */
export function filterPlaylists<T extends { name: string; customName: string | null }>(
  playlists: T[],
  query: string
): T[] {
  return rankByMatchScore(
    playlists,
    query,
    (p) => [p.name, p.customName],
    (p) => p.name
  );
}

/** Fixed entries (views, the Standalone row) match on their label. */
export function filterLabeled<T extends { label: string }>(items: T[], query: string): T[] {
  return rankByMatchScore(
    items,
    query,
    (i) => [i.label],
    (i) => i.label
  );
}
