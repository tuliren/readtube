# App Choices

## YouTube data fetching overview

Every YouTube read goes through the official **Data API v3** first (our own GCP project's key, `YOUTUBE_API_KEY`; free 10,000 units/day) and falls back to the legacy sources only when the key is unset or the Data API attempt fails. Transcripts are the exception: the Data API's captions endpoint is owner-OAuth-only, so TranscriptAPI is primary there. All Data API calls live in `apps/web/src/lib/platforms/youtube/dataApi.ts`.

> **TODO — delete the scrape and RSS fallbacks.** With the Data API primary, `channelScrape.ts`, `channelRss.ts`, and `playlistScrape.ts` (plus the `mergeSnapshot` / `buildSnapshotFromScrape` / `isScraped` machinery in `channelSnapshot.ts`) are only exercised when the Data API is unavailable. Once the `youtube_fetch` analytics (see "Analytics events") confirm the Data API serves ~100% of production traffic, remove scrape entirely (its enrichment fields — duration, logo, handle, premiere/members filtering, older-than-15 videos — are all covered by the Data API) and drop RSS as a fetch source, keeping only `Data API → TranscriptAPI` as the fallback chain. RSS is the least reliable tier anyway: YouTube soft-blocks hosting IPs by returning empty 200s (the reason the zero-video TranscriptAPI fallback exists). Keep RSS longest if a fully-independent, non-GCP failure domain is still wanted; scrape has no such argument and should go first.

Notation: `A → B` means B runs after A (within a tier) or only if A failed (between fallback tiers); `A ∥ B` means A and B are fetched **in parallel**.

| Operation | Primary (Data API) | Fallback chain | Quota units |
|---|---|---|---|
| Add channel — `/channel/UC…` URL or bare UC id | `channels.list id=` → uploads `playlistItems.list` → (`UUSH…` `playlistItems.list` ∥ `videos.list`) | (scrape ∥ RSS) merged → TranscriptAPI `/channel/latest` → scrape-only | 4 |
| Add channel — `@handle` URL | same, `channels.list forHandle=` resolves the handle | scrape **first** (resolves UC id) → RSS → TranscriptAPI → scrape-only | 4 |
| Refresh channel (cron; each channel at most once per `STALE_DAYS`) | same as add channel | same as UC-id add channel | 4 |
| Add playlist | `playlists.list` → `playlistItems.list` → `videos.list` | playlist RSS → playlist page scrape | 3 |
| Add video | `videos.list` → (`UUMO…` members-only check ∥ `channels.list` handle/logo) | (watch page ∥ oEmbed) → TranscriptAPI (bundles the transcript) | 3 |
| Scheduled-video detection (`ensureTranscript`, before sticky-locking `transcript_unavailable`) | `videos.list` (`liveBroadcastContent` + `liveStreamingDetails.scheduledStartTime`) | watch-page scrape → TranscriptAPI `/channel/latest` | 1 |
| Transcript fetch | — (captions are owner-OAuth-only, impossible with an API key) | TranscriptAPI (primary) | — |

Shared behavior:

- Adding an already-fresh channel (cache hit) fetches nothing.
- The Data API tier falls through to the fallback chain when the key is unset, the input can't be expressed as an API query (no UC id / `@handle`), the call fails (quota, network, not found), or it returns zero videos.
- Private playlists are invisible to `playlists.list`, so they land in the playlist fallback chain (the page scrape is what detects them and raises `PRIVATE_PLAYLIST`). Auto-generated Mixes (`RD…`) are served by the Data API (verified live), with per-video uploader channels correctly attributed.
- Shorts filtering: channel paths use the shorts-only `UUSH…` playlist (404 = channel has no Shorts), falling back to a ≤60s duration heuristic; the playlist path uses the duration heuristic directly, since a playlist can mix videos from many owner channels.
- Live/upcoming broadcasts (`liveBroadcastContent !== 'none'`), non-public playlist entries, and future-dated videos are dropped on every Data API path.

## Channel snapshot fetching

`fetchChannelSnapshot` (`apps/web/src/lib/platforms/youtube/channelSnapshot.ts`) implements the channel rows of the overview table above. On success the Data API produces the complete snapshot alone — channel name/handle/logo plus up to 50 recent uploads with full descriptions, exact publish times, and durations.

The fallback chain combines three sources. Scrape always contributes channel handle, logo, and per-video duration. The video list comes from RSS (primary), with TranscriptAPI `/channel/latest` as a fallback, and a scrape-only build as the last resort.

TranscriptAPI fires when **either** of these is true:
1. RSS threw (network error / 404).
2. Scrape and RSS both succeeded but each returned zero videos — observed when YouTube soft-blocks a hosting IP (e.g. Vercel) by serving 200s with empty channel pages and empty feeds. TranscriptAPI routes via different infrastructure.

When RSS + TranscriptAPI both fail, the scrape-only build marks every video `isScraped: true` so a later healthy RSS pass doesn't get clobbered (create-on-insert, skip-on-update).

## Playlist fetching

`fetchPlaylistData` (`apps/web/src/lib/workflows/add-playlist/index.ts`) implements the add-playlist row of the overview table. The Data API tier is strictly richer than both legacy sources combined — the RSS path has publish dates but no durations, the scrape path has durations but no publish dates; the Data API has both, plus full descriptions and the per-video uploader channel (playlists can mix videos from many channels). Private playlists fall through to RSS/scrape as described above.

## Scheduled premieres / upcoming livestreams

Channel-ingest paths drop future-dated videos: `channelScrape.ts` skips `upcomingEventData` entries; `channelRss.ts` and TranscriptAPI's `fetchChannelLatest` drop `published > now`. So refreshes never pull in scheduled videos.

For individually-added videos that are (or turn) scheduled, `ensureTranscript` probes the video (`scheduledVideo.ts`) before flipping the sticky `transcript_unavailable` flag. The Data API is primary (`liveBroadcastContent: 'upcoming'` + `liveStreamingDetails.scheduledStartTime`, authoritative both ways when it answers; a video missing from the response — deleted/private — is treated as indeterminate, not as "not scheduled"). Fallbacks: watch-page scrape (`isUpcoming` + `liveBroadcastDetails.startTimestamp`), then TranscriptAPI `/channel/latest`. Detected ones return `425` (`code: 'scheduled'`) so the reader shows a toast instead of sticky-locking.

## Members-only videos

Ingesting a members-only video is always a mistake: the watch page is paywalled, so the transcript fetch is guaranteed to fail and sticky-locks the entry as captionless.

**Data API path (primary).** Verified empirically (two channels with fresh members-only uploads): the `UU…` uploads playlist structurally excludes members-only videos, so they can never enter a channel snapshot via the Data API. Members-only content lives in its own undocumented-but-stable playlist family — `UUMF…` (long-form), `UUMV…` (live), `UUMS…` (shorts), `UUMO…` (union of all three; 404 = channel has no members content). That family is also the **only** API-side signal: `videos.list` returns members-only videos as indistinguishable public videos (`privacyStatus: public`), and oEmbed returns 200. The add-video flow therefore checks `UUMO…` (`isMembersOnlyVideo` in `dataApi.ts`, best-effort, 1 quota unit) and rejects with `MembersOnlyVideoError` → `AddVideoError('MEMBERS_ONLY')` → HTTP 400. The rejection is deliberately not swallowed by the video-snapshot fallback chain — the paywalled watch page still serves og meta tags and would happily ingest the doomed row.

**Scrape/RSS fallback path.** `channelScrape.ts` drops members-only uploads (badge `BADGE_MEMBERS_ONLY` / `BADGE_STYLE_TYPE_MEMBERS_ONLY`) into `memberOnlyVideoIds`, which `mergeSnapshot` uses to drop matching RSS entries too (the channel `/videos` tab, unlike the `UU…` playlist, does list members-only videos).

## Generation usage & quota

Metered off the `UserRequest` audit log (no counter table); `lib/usage/quota.ts` derives it. Only `TRANSCRIPT` requests count toward `MONTHLY_GENERATION_QUOTA` (`getGenerationUsage`, UTC calendar month); `getLifetimeUsage` groups all-time counts by type. Rows are only written when work actually happened, so every row counts regardless of `outcome`. Surfaced read-only on `/usage`; no enforcement yet.

## Analytics events

Server-side Vercel Web Analytics custom events (`lib/analytics/events.ts`, via `@vercel/analytics/server`). Vercel caps a custom event at **2 properties**, so concerns are split across three event names rather than one:

| Event | Properties | Emitted from |
|---|---|---|
| `content_generated` | `type` (transcript/summary/article), `outcome` (generated/unavailable/failed) | the `UserRequest` audit writers (`lib/usage/userRequest.ts`) — the one choke point that sees every terminal outcome, so it counts the same generations the quota does (opt-out regens excluded) |
| `content_added` | `type` (video/playlist/channel), `platform` (youtube/bilibili) | each flow's genuine new-add seam: `addVideoForUser` (new standalone entry), `addPlaylistForUser` (fresh playlist), `finishSubscribe` (new channel subscription) |
| `youtube_fetch` | `type` (channel/video/playlist/scheduled), `source` (data_api/rss/scrape/transcript_api) | the four fetch orchestrators, tagged with the tier that actually served the request — this is how we watch how often the fallbacks fire behind the Data API |

Emission never throws — analytics must not break a request or workflow step — and stays silent in the development environment (`VERCEL_ENV` unset or `development`), so local dev / `scripts/` probes / tests emit nothing. Calls are **awaited**, not fire-and-forget: `@vercel/analytics/server`'s `track()` reads the visitor headers and a `waitUntil` flush hook from Vercel's ambient per-request context, which exists in route handlers but **not** in Workflow/cron steps (add-channel, refresh-channels, summary/article generation). There, `emit()` passes an empty `headers` object so `track()` still sends (it throws "No session context found" without one) and the caller awaits so the send completes before the step returns. The trade-off: events emitted from Workflow steps are unattributed (no visitor/geo) but still counted.

## Signup attribution

Tracks where a signed-up user was referred from, modeled on first-touch attribution: `UtmParamTracker` (mounted globally in the root layout) captures UTM params, the external referrer (`document.referrer`, with auth-provider and same-site referrers filtered out as OAuth redirect artifacts; an explicit `?referrer=` query param wins), and the landing-page pathname into localStorage on first visit — earliest values win, so later navigations don't overwrite the original source. After Clerk sign-in, `AttributionTracker` POSTs the stored payload to `/api/attribution`, which re-sanitizes it server-side (whitelisted fields, 512-char truncation, referrer re-filtering) and writes one `SignupAttribution` row per user (unique `user_id`, FK to `User.source_id`, cascade delete). Rows are only written while the account is younger than 24h (`SIGNUP_ATTRIBUTION_WINDOW_MS`, checked against Clerk `createdAt`), so a tracked link clicked by an established user isn't misattributed as their signup source. Because the landing page is always captured, localStorage nearly always holds data; a per-user handled flag stops re-submission on later page loads, and a failed POST leaves the data in place to retry. A successful record also emits a client-side `signed_up` Vercel event with `{source, landing_page}` — `source` collapses to `utm_source` → referrer hostname → `organic` (the full detail lives only in the DB row, since events cap at 2 properties). Logic lives in `lib/analytics/utmParams.ts` (capture/storage) and `lib/analytics/signupAttribution.ts` (shared sanitization/window).

## Sitemap & robots

`app/sitemap.ts` and `app/robots.ts` are static metadata routes (`force-static`), generated once per deploy at build time against the build-time `DATABASE_URL`. The sitemap lists the marketing/legal pages plus every public video reader page (`/p/videos/[videoId]`) that actually resolves — mirroring that page's 404 rule, a video qualifies only when its *latest* transcript has a READY summary or article. Entries are ordered `id DESC` — cuid ids are timestamp-prefixed, so this means newest-added-first, and as a total order on the primary key it's deterministic for a given DB state with no tie-break column and can be served by the PK index with early termination if the cap ever binds. They're capped at `PUBLIC_VIDEO_SITEMAP_CAP` (10,000; the protocol allows 50,000 per file), and `lastModified` is the newest READY generation timestamp — a stored value, never `new Date()`, so rebuilding against an unchanged DB yields a byte-identical sitemap. The cap is applied twice: as the candidate query's `take` (bounding the build-time fetch) and again in `buildVideoSitemapEntries`, which re-checks the latest-transcript rule the `some`-transcript filter can't express — so a dropped candidate can leave the sitemap marginally under the cap, which is harmless (see `lib/sitemap/publicVideoSitemap.ts`). The route logs its entry count and query duration during the build (`[sitemap] ...` in the Vercel build log) since that's the only per-route timing visibility `next build` offers. Both paths are listed in `proxy.ts`'s public routes — the matcher's static-extension exclusions don't cover `.xml`/`.txt`, so without that crawlers get a sign-in redirect. New videos appear on the next deploy; robots.txt exists mainly to point crawlers at `/sitemap.xml`.

## User identity across environments

Production authenticates against the Clerk production instance; preview deployments and local dev use the Clerk development instance. Preview databases are Neon branches forked from the production branch (production is the Neon default branch), so they carry production `User` rows whose `source_id` is a production Clerk id — but a login on a preview deployment yields a *development* Clerk id for the same person. `saveUser` in `apps/web/src/lib/db/user.ts` (shared by the Clerk webhook and the `ensureUserExists` login fallback) reconciles this: outside production (`VERCEL_ENV !== 'production'`), when the authenticated email already belongs to a row with a different `source_id`, the row is adopted by rewriting its `source_id` to the current Clerk id. Every user-owned table references `User.source_id` with `ON UPDATE CASCADE`, so subscriptions, folders, consumptions, etc. follow automatically and the preview login sees the full production dataset for that user. In production a source_id/email mismatch is a real inconsistency, so the write still fails on the unique email constraint.

## Search

Two search surfaces share one relevance philosophy — Postgres ranks large text, the client ranks short labels:

- **⌘K palette** (`components/inbox/CommandPaletteDialog.tsx` + `GET /api/search`): sectioned keyword search over the content types that have search infrastructure. Videos match through `Video.search_tsv` — a STORED generated tsvector over title (weight A) + description (weight B) with a GIN index, queried via `plainto_tsquery('english', …)` and ordered by `ts_rank` — scoped to the user's library (subscribed channels ∪ standalone videos ∪ playlist videos). Channels match by name/handle substring over the user's subscriptions and are ranked in-process by match position (exact > prefix > word-boundary > substring, `lib/search/matchScore.ts`). Video hits are further classified by *which field matched* — a per-row `to_tsvector(title) @@ query` re-check — and the palette renders "Videos (by title)" and "Videos (by description)" as separate sections so a hit whose visible title lacks the query terms isn't mystifying; a `ROW_NUMBER() OVER (PARTITION BY title_match)` caps each class at N independently. Description matches carry a `ts_headline` snippet using `[[`/`]]` delimiters that the client splits into `<mark>` elements — description text never reaches the DOM as HTML, so markup in a video description can't inject. Queries containing CJK take a separate path (`lib/search/cjk.ts`): the english-config tsvector can't tokenize unsegmented CJK text, so every whitespace-delimited term must match title or description as a case-insensitive substring — ILIKE backed by the `pg_trgm` trigram GIN indexes on `Video.title`/`Video.description` (the `add_pg_trgm` migration) — ordered by recency instead of `ts_rank`, with the same per-class caps and `[[`/`]]` highlighting computed in-process. The inbox `q=` search applies the identical CJK rule in `loadVideos.ts`. Transcripts and generated summaries/articles are deliberately *not* searched: they have no keyword index, and an unindexed scan over the largest text columns per keystroke isn't acceptable — add a tsvector + section to `/api/search` when that index lands. cmdk's client-side fuzzy filter is disabled (`shouldFilter={false}`) because the server already ranked the rows; re-filtering would drop stemmed matches ("running" → "run"). The palette also renders any commands features register via `useCommand` — a registry that currently has no callers but stays wired for future feature streams. Discoverability: `GlobalSearchButton.tsx` in the sidebar header (and the mobile drawer header, sans chip) opens the palette on click and shows the platform-appropriate shortcut as a keyboard chip.
- **Sidebar filter** (`components/inbox/SidebarFilterInput.tsx` / `SidebarFilterResults.tsx`): a purely client-side filter over navbar items — views, Standalone, playlists, channels — using the same `matchScore` ranking against data the sidebar already holds (`SidebarDataContext`), so no server round-trip. While it holds text, the Views/Videos/Channels sections are swapped for a flat match list whose rows reuse the shared sidebar row primitives; clearing (or Escape) restores the sections. Hidden in the collapsed 56px rail.

The inbox list's own search box (`SearchInput.tsx`, the `q=` inbox query param) rides the same `search_tsv` index via `loadVideos.ts` — palette and inbox search can't diverge on video-match semantics because both go through `plainto_tsquery` over the same column.

## Tuning article generation

Article generation picks between **single-pass** (one LLM call) and **map-reduce** (split the transcript into sections, generate in parallel, then a reduce pass consolidates the outline). Every knob lives in `apps/web/src/constants.ts` and is documented inline — the highlights:

- `MAP_REDUCE_THRESHOLD_MINUTES` — at/above uses map-reduce, below uses single-pass. Falls back to transcript reading time when `durationSeconds` is missing; set huge to disable map-reduce.
- `SECTION_TARGET_WORDS` — the one knob for section size; `MIN/MAX_SECTION_WORDS` derive from it (0.5×/2×). Lower for more, smaller sections.
- `MAX_SECTIONS`, `MAX_PARALLEL_SECTIONS`, `EMBED_WINDOW_WORDS`, `TOPIC_BOUNDARY_DISTANCE` — map-reduce caps, per-section concurrency, and the topic-shift cosine threshold (lower → more semantic cuts).
- `MAX_PRESTREAM_ATTEMPTS`, `STREAM_INACTIVITY_TIMEOUT_MS` — retry + watchdog around `streamText`; raise the timeout if slow-but-healthy streams trip the watchdog.

Each map-reduce run logs one `[articleWorkflow:map-reduce] section grouping summary` (`console.info`) with window/word/section counts, distance stats, and per-section cut reasons — read it to see why a section count was chosen. A `(fallback)` label means the embedding pipeline failed and deterministic word-count chunking was used.
