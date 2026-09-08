/**
 * The subset of Bilibili's video "view" payload we consume, normalized
 * from either source:
 *
 *   - `api.bilibili.com/x/web-interface/view` returns it as `data`.
 *   - JustOneAPI's `get-video-detail/v2` returns the video page's
 *     `__INITIAL_STATE__` with the same object at `data.videoData`.
 *
 * Every field except `bvid` + `title` is nullable rather than optional
 * so consumers only ever deal with `== null`, and the sanitizer below
 * is the single place that trusts external data.
 */
export interface BilibiliViewData {
  bvid: string;
  title: string;
  /** Legacy numeric video id. */
  aid: number | null;
  /** cid of the first part; per-part ids live in `pages`. */
  cid: number | null;
  desc: string | null;
  /** Cover URL (protocol-relative or http(s)). */
  pic: string | null;
  /** Unix seconds. */
  pubdate: number | null;
  /** Seconds. */
  duration: number | null;
  owner: { mid: number; name: string; face: string | null } | null;
  pages: Array<{ cid: number | null }>;
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

/**
 * Normalize a raw view object into {@link BilibiliViewData}. Returns
 * null when the payload lacks the two fields nothing downstream can
 * work without (`bvid`, `title`) — the caller decides whether that is
 * "no such video" or "malformed response".
 */
export function toBilibiliViewData(raw: unknown): BilibiliViewData | null {
  if (raw == null || typeof raw !== 'object') {
    return null;
  }
  const v = raw as Record<string, unknown>;
  if (typeof v.bvid !== 'string' || v.bvid.length === 0 || typeof v.title !== 'string') {
    return null;
  }

  const rawOwner =
    v.owner != null && typeof v.owner === 'object' ? (v.owner as Record<string, unknown>) : null;
  const owner =
    rawOwner != null && typeof rawOwner.mid === 'number' && typeof rawOwner.name === 'string'
      ? { mid: rawOwner.mid, name: rawOwner.name, face: stringOrNull(rawOwner.face) }
      : null;

  const pages = Array.isArray(v.pages)
    ? v.pages
        .filter((p): p is Record<string, unknown> => p != null && typeof p === 'object')
        .map((p) => ({ cid: numberOrNull(p.cid) }))
    : [];

  return {
    bvid: v.bvid,
    title: v.title,
    aid: numberOrNull(v.aid),
    cid: numberOrNull(v.cid),
    desc: stringOrNull(v.desc),
    pic: stringOrNull(v.pic),
    pubdate: numberOrNull(v.pubdate),
    duration: numberOrNull(v.duration),
    owner,
    pages,
  };
}
