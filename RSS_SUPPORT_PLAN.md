# Plan: Add RSS feeds as a second content source

## Context

ReadTube today turns YouTube (and Bilibili) subscriptions into a readable inbox. This plan adds **RSS feeds** as a source so users can read blog/news articles in the same inbox, with the same search, notes, star/save/archive, and AI summaries.

The app is **already multi-platform by design**. The `Channel → Video → Transcript → Summary/Article` spine is generic content plumbing; platform coupling is concentrated in one enum (`VideoPlatformType`) and a small `VideoPlatform` abstraction (`apps/web/src/lib/platforms/base.ts`). Bilibili is living proof that a second, non-YouTube source works end to end. So RSS is mostly "register a third platform and seed each item's body as a `Transcript`," not a new subsystem.

### Scope decisions

- **Full-article extraction** — when a feed ships only an excerpt, fetch the item's page and extract the full text (Readability), not just the truncated feed body.
- **Summary + search + Ask** — seed the article body as a `Transcript` so short/long AI summaries, full-text + semantic search, and "Ask your inbox" all work. **Skip the AI Article rewrite** (redundant — an RSS item is already an article).
- **Feed URL or site URL** — accept a direct feed URL, and auto-discover the feed from a site homepage via `<link rel="alternate" type="application/rss+xml">`.

## How much of the database is reusable?

**Reused as-is — no schema change, no new tables (the overwhelming majority):**

| Table | How RSS uses it |
|---|---|
| `Channel` | An RSS **feed** is a Channel. `rss_url` (already exists) = feed URL, `source_id` = feed URL, `name`/`description`/`logo_url` from feed metadata. |
| `Video` | An RSS **item** is a Video. `title`, `description`, `published_at` from the entry. |
| `Transcript` | The **article body** (extracted, converted to Markdown) is `Transcript.text`. This is the linchpin: it unlocks Summary + embeddings + Ask for free. |
| `Summary` | AI summary of the body — works unchanged once a Transcript exists. |
| `VideoEmbedding` | pgvector embedding of the body — powers semantic search / Ask, unchanged. |
| `UserSubscription`, `Folder` | Subscribe to a feed, group feeds into folders — unchanged (watermark/priority/mute all generic). |
| `UserVideoConsumption`, `VideoStar`, `VideoSave`, `VideoArchive`, `StandaloneVideo`, `Note` | All keyed on `(user_id, video_id)` — content-type agnostic, work as-is. |
| `search_tsv` (GIN) + `pg_trgm` indexes | Full-text/substring search over `Video.title/description` — free, no change. |
| `UserRequest` | AI cost/audit log — reused for RSS summary generation. |

**Not used by RSS (left untouched):** `Playlist` / `PlaylistVideo` (a YouTube-import concept), and the `Video.transcript_generation_*` columns (AI transcription of caption-less videos — irrelevant since RSS ships text).

**Small schema additions (one migration):**

1. `VideoPlatformType` += `RSS`.
2. `TranscriptSource` += `FEED` (RSS body isn't `CAPTIONS`/`GENERATED`; lets the reader avoid an "AI-generated" indicator).
3. `Video.url String?` — the item's canonical **permalink**. Needed because today the external link is *reconstructed* from `source_type` + `source_id` (`buildWatchLink`), which can't represent an arbitrary article URL. Null for YouTube/Bilibili.

> **Migration gotcha** (per `CLAUDE.md` + `packages/database/README.md`): adding a column to `Video` makes Prisma's diff try to DROP/RECREATE `video_search_tsv_idx`, `video_embedding_hnsw_idx`, and the `search_tsv` generated-column default. Hand-remove those spurious statements from the generated SQL. Follow `20260418053959_add_bilibili_platform_and_nullable_rss_url` as the precedent, and run `yarn db:create-migration` (writes both up + `down.sql`) then `yarn db:deploy`.

**Bottom line:** ~15 tables reused essentially untouched; zero new tables; 3 additive columns/enum values.

## Implementation

### 1. New RSS platform module — `apps/web/src/lib/platforms/rss/`

Mirror `platforms/bilibili/`. A new `RssPlatform extends VideoPlatform` (`platforms/rss/platform.ts`) registered **last** in `PLATFORMS` (`platforms/index.ts`) so it acts as the catch-all for URLs the shape-specific platforms reject. Backing function modules:

- `feed.ts` — fetch + parse a feed into a neutral `ChannelSnapshot`. Reuse the existing `fast-xml-parser` + the parsing shape already proven in `platforms/youtube/channelRss.ts` (`extractLinkHref`, future-date filtering), generalized to RSS 2.0 / Atom / RDF (`<item>`/`<entry>`, `pubDate`/`published`, `guid`/`id`, `content:encoded`/`summary`, `enclosure`/`media:thumbnail`). `source_id` per item = GUID (fallback to link); `link` = permalink; capture inline `content:encoded` when present.
- `discover.ts` — given a site URL, fetch the HTML and read `<link rel="alternate" type="application/rss+xml|atom+xml">` to find the feed URL. Used by the add-channel path.
- `extract.ts` — **full-article extraction**: fetch a permalink, run Readability (`@mozilla/readability` + a DOM shim such as `linkedom` — lighter than `jsdom` for serverless; verify it works under the Vercel runtime), convert the extracted HTML → Markdown (`turndown`) and sanitize. Returns Markdown text.

`RssPlatform` method mapping to the `VideoPlatform` contract (`platforms/base.ts`):

- `type = 'RSS'`.
- `extractChannelSourceId(input)` — return the URL for any `http(s)` URL not claimed by earlier platforms (real feed-vs-site resolution is deferred to `fetchChannelSnapshot`, exactly like YouTube defers `@handle` resolution). This is what puts RSS into the channel-add path.
- `fetchChannelSnapshot(feedOrSiteUrl)` — fetch; if it's a feed, parse it; if it's HTML, `discover.ts` → feed URL → parse. Throw the `FatalError`-tagged `INVALID_URL:` when no feed is found (add-channel route already maps this to a clean HTTP error).
- `fetchTranscript(sourceId, ctx)` — **lazy body extraction on first read** (mirrors YouTube's on-demand transcript, so nothing extra runs during cron). Given the item's permalink, use inline `content:encoded` if it was full, else `extract.ts` on the permalink. Return one `TranscriptSegment` (`startMs/endMs = 0`) with the Markdown body. `ensureTranscript` persists it as `Transcript(source: FEED)`.
- `buildRssUrl(sourceId)` = the feed URL itself. `isScheduledVideo` = default no-op.
- `matchesUrl` / `matchesSourceId` / `fetchVideoSnapshot` — return `false`/throw "unsupported": RSS is added as a **feed**, not a single-item paste, so it stays OUT of `detectPlatform` (single-video add) and `detectPlatformTypeFromSourceId` (shape detection). This deliberately avoids the catch-all hijacking arbitrary URLs in the add-video flow and the id-collision warned about in `platforms/index.ts`.

### 2. Text seam — `apps/web/src/lib/transcripts/ensureTranscript.ts`

`ensureTranscript` already loads the `Video` row before dispatching to `getPlatformByType(source_type).fetchTranscript(source_id)`. Widen `fetchTranscript` to accept an optional context and pass `{ url: video.url }` so `RssPlatform` gets the permalink it needs. Backward-compatible — YouTube/Bilibili ignore it. Everything downstream (`persistTranscript`, summary, embedding) is unchanged.

### 3. Reader routing by internal id — `apps/web/src/lib/videos/resolveVideoSourceId.ts`

The `/videos/[videoId]` route infers platform from `source_id` shape, which RSS GUIDs can't satisfy (and may contain `/`). Add a fallback: when `detectPlatformTypeFromSourceId` returns `null`, try `prisma.video.findUnique({ where: { id: videoId } })`. RSS video links then use the internal cuid (`/videos/<Video.id>`), which doesn't collide with 11-char YouTube ids or `BV…` Bilibili ids. The row/reader link builders emit `/videos/<id>` for `source_type === 'RSS'`.

### 4. Reader UI — `apps/web/src/components/reader/`

Reuse the `VideoReader` shell wholesale; make video-only affordances conditional on `source_type === 'RSS'`:

- Render the feed body (the `FEED` transcript's Markdown) through the existing generic `reader/ArticleMarkdown.tsx` renderer — **not** the timestamped `TranscriptReader`. Present it as the primary "Read" tab.
- Keep the **Summary** tab (works via the seeded transcript). **Hide the AI Article tab** (per scope) and the transcript-generation panel.
- Hide duration, hide the "T"/timestamp UI; the external link becomes **"Read original"** → `Video.url`.
- `buildWatchLink` / `buildChannelLink` (`lib/urls/watchUrl.ts`) have an `assertNeverPlatform` exhaustiveness guard — add an `RSS` case. For RSS the original link is `Video.url` (channel link = feed's site), so the reader passes the URL rather than reconstructing it.

### 5. Add-feed UI — `apps/web/src/components/inbox/AddChannelModal.tsx`

Extend the existing modal's copy/placeholder to mention pasting a blog/feed URL. The `POST /api/channels` route already runs `detectChannelSource → addChannelWorkflow → upsertChannelWithVideos`; RSS flows through it unchanged once `extractChannelSourceId`/`fetchChannelSnapshot` are wired. No new API route.

### 6. Refresh cron — no structural change

`refresh-channels` (`lib/workflows/refresh-channels/steps.ts`) already selects subscribed channels with `rss_url` set and dispatches via `getPlatformByType(source_type).fetchChannelSnapshot(source_id)`. RSS channels have `rss_url` set and will be picked up automatically; `RssPlatform.fetchChannelSnapshot` re-fetches the feed for new items. Verify the `fetchStaleChannels` filter doesn't exclude RSS (the Bilibili `JUSTONEAPI_TOKEN` guard is platform-specific and won't).

### Representative files

- New: `apps/web/src/lib/platforms/rss/{platform,feed,discover,extract}.ts` (+ Jest tests).
- Register: `apps/web/src/lib/platforms/index.ts`.
- Schema/migration: `packages/database/prisma/schema.prisma` + new migration dir.
- Seams: `lib/transcripts/ensureTranscript.ts`, `lib/videos/resolveVideoSourceId.ts`, `lib/urls/watchUrl.ts`.
- UI: `components/reader/VideoReader.tsx` (conditional rendering), `components/inbox/{AddChannelModal,VideoRow}.tsx` (link builder).
- Dependencies to add: a Readability extractor (`@mozilla/readability` + `linkedom`) and `turndown`.

## Reuse map (one line)

Register RSS as a third `VideoPlatform`; feed → `Channel`, item → `Video`, extracted body → `Transcript(FEED)`. Everything user-facing — inbox, folders, read state, star/save/archive, notes, full-text + semantic search, Ask-your-inbox, summaries, sharing — is inherited unchanged. Net new: one platform module (~4 files), a full-article extractor, 3 additive schema fields, and conditional reader rendering.

## Verification

1. `yarn lint && yarn typecheck && yarn format:check && yarn test && yarn integrationTest` (project convention).
2. Unit tests for the critical parsing/extraction logic: `feed.ts` (RSS 2.0, Atom, RDF fixtures; missing guid → link fallback; future-dated drop), `discover.ts` (feed link in `<head>`; none found), `extract.ts` (excerpt vs full `content:encoded`; HTML→Markdown). Use `it.each` per `CLAUDE.md`.
3. End-to-end against the dev server (Clerk auth via the user's Chrome session):
   - Add a **full-content** feed (e.g. a Substack) via its feed URL, and a **site URL** (auto-discovery) → confirm the feed resolves, items appear in the inbox.
   - Open an item → the article body renders as Markdown, no duration/transcript-timestamp UI, "Read original" links to the permalink.
   - Add an **excerpt-only** feed → confirm full-article extraction fills the body, not just the excerpt.
   - Generate a Summary; run a search and an "Ask your inbox" query that should hit the article; star/save/archive/note and mark-as-read.
   - Trigger a manual channel refresh and confirm new items ingest; confirm the `*/30` cron path includes the RSS channel.

## Out of scope for v1 (possible follow-ups)

- Adding a **single article** URL as a standalone item (would require RSS to join `detectPlatform`/`fetchVideoSnapshot`); kept out to avoid the add-video flow grabbing arbitrary URLs.
- OPML import/export of feeds.
- Paywall/anti-bot handling for extraction failures (fall back to the feed excerpt when extraction fails).
