/**
 * Response shape of GET /api/search, shared between the route handler
 * and the ⌘K command palette client so the two can't drift.
 *
 * Sections map to the content types that have search infrastructure
 * today:
 *   - channels: subscribed channel names/handles (small per-user set,
 *     matched in-process with `matchScore`)
 *   - videos: title + description via the Video.search_tsv tsvector
 *     GIN index
 *
 * Transcripts and generated summaries/articles are intentionally
 * absent — they have no keyword index yet, and scanning their text
 * columns per keystroke would be a sequential scan over the largest
 * tables in the schema. Add a tsvector + section here when that index
 * exists.
 */

export interface ChannelSearchHit {
  id: string;
  name: string;
  handle: string | null;
  sourceId: string;
  logoUrl: string | null;
}

/**
 * Which field of the video the query actually matched. The palette
 * groups hits by this ("Videos (by title)" vs "Videos (by
 * description)") so a hit whose title doesn't contain the query terms
 * isn't confusing. A video matching on both fields is classified as
 * a title match.
 */
export type VideoMatchField = 'title' | 'description';

export interface VideoSearchHit {
  id: string;
  sourceId: string;
  title: string;
  channelName: string;
  publishedAt: string | null;
  matchedBy: VideoMatchField;
  /**
   * For description matches: the matched fragment of the description,
   * with `[[` `]]` wrapping each hit term (ts_headline custom
   * delimiters — rendered as <mark> by the client, never as raw HTML,
   * so a description containing markup can't inject it). Null for
   * title matches.
   */
  descriptionSnippet: string | null;
}

export interface SearchResponse {
  channels: ChannelSearchHit[];
  videos: VideoSearchHit[];
}
