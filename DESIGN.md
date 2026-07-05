# App Choices

## YouTube data fetching overview

Every YouTube read goes through the official **Data API v3** first (our own GCP project's key, `YOUTUBE_API_KEY`; free 10,000 units/day) and falls back to the legacy sources only when the key is unset or the Data API attempt fails. Transcripts are the exception: the Data API's captions endpoint is owner-OAuth-only, so TranscriptAPI is primary there. All Data API calls live in `apps/web/src/lib/platforms/youtube/dataApi.ts`.

| Operation | Primary (Data API) | Fallback chain | Quota units |
|---|---|---|---|
| Add channel — `/channel/UC…` URL or bare UC id | `channels.list id=` → uploads + `UUSH…` `playlistItems.list` → `videos.list` | scrape ∥ RSS merge → TranscriptAPI `/channel/latest` → scrape-only | 4 |
| Add channel — `@handle` URL | same, `channels.list forHandle=` resolves the handle | scrape **first** (resolves UC id) → RSS → TranscriptAPI → scrape-only | 4 |
| Refresh channel (cron; each channel at most once per `STALE_DAYS`) | same as add channel | same as add channel | 4 |
| Add playlist | `playlists.list` → `playlistItems.list` → `videos.list` | playlist RSS → playlist page scrape | 3 |
| Add video | `videos.list` + `UUMO…` members-only check + `channels.list` (handle/logo) | watch page + oEmbed → TranscriptAPI (bundles the transcript) | 3 |
| Scheduled-video detection (`ensureTranscript`, before sticky-locking `transcript_unavailable`) | — (not yet migrated) | watch-page scrape → TranscriptAPI `/channel/latest` | — |
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

For individually-added videos that are (or turn) scheduled, `ensureTranscript` probes the watch page (`scheduledVideo.ts`) before flipping the sticky `transcript_unavailable` flag — scrape's `isUpcoming` + `liveBroadcastDetails.startTimestamp` is authoritative, TranscriptAPI `/channel/latest` a fallback. Detected ones return `425` (`code: 'scheduled'`) so the reader shows a toast instead of sticky-locking.

## Members-only videos

Ingesting a members-only video is always a mistake: the watch page is paywalled, so the transcript fetch is guaranteed to fail and sticky-locks the entry as captionless.

**Data API path (primary).** Verified empirically (two channels with fresh members-only uploads): the `UU…` uploads playlist structurally excludes members-only videos, so they can never enter a channel snapshot via the Data API. Members-only content lives in its own undocumented-but-stable playlist family — `UUMF…` (long-form), `UUMV…` (live), `UUMS…` (shorts), `UUMO…` (union of all three; 404 = channel has no members content). That family is also the **only** API-side signal: `videos.list` returns members-only videos as indistinguishable public videos (`privacyStatus: public`), and oEmbed returns 200. The add-video flow therefore checks `UUMO…` (`isMembersOnlyVideo` in `dataApi.ts`, best-effort, 1 quota unit) and rejects with `MembersOnlyVideoError` → `AddVideoError('MEMBERS_ONLY')` → HTTP 400. The rejection is deliberately not swallowed by the video-snapshot fallback chain — the paywalled watch page still serves og meta tags and would happily ingest the doomed row.

**Scrape/RSS fallback path.** `channelScrape.ts` drops members-only uploads (badge `BADGE_MEMBERS_ONLY` / `BADGE_STYLE_TYPE_MEMBERS_ONLY`) into `memberOnlyVideoIds`, which `mergeSnapshot` uses to drop matching RSS entries too (the channel `/videos` tab, unlike the `UU…` playlist, does list members-only videos).

## Generation usage & quota

Metered off the `UserRequest` audit log (no counter table); `lib/usage/quota.ts` derives it. Only `TRANSCRIPT` requests count toward `MONTHLY_GENERATION_QUOTA` (`getGenerationUsage`, UTC calendar month); `getLifetimeUsage` groups all-time counts by type. Rows are only written when work actually happened, so every row counts regardless of `outcome`. Surfaced read-only on `/usage`; no enforcement yet.

## Tuning article generation

Article generation picks between **single-pass** (one LLM call) and **map-reduce** (split the transcript into sections, generate in parallel, then a reduce pass consolidates the outline). Every knob lives in `apps/web/src/constants.ts` and is documented inline — the highlights:

- `MAP_REDUCE_THRESHOLD_MINUTES` — at/above uses map-reduce, below uses single-pass. Falls back to transcript reading time when `durationSeconds` is missing; set huge to disable map-reduce.
- `SECTION_TARGET_WORDS` — the one knob for section size; `MIN/MAX_SECTION_WORDS` derive from it (0.5×/2×). Lower for more, smaller sections.
- `MAX_SECTIONS`, `MAX_PARALLEL_SECTIONS`, `EMBED_WINDOW_WORDS`, `TOPIC_BOUNDARY_DISTANCE` — map-reduce caps, per-section concurrency, and the topic-shift cosine threshold (lower → more semantic cuts).
- `MAX_PRESTREAM_ATTEMPTS`, `STREAM_INACTIVITY_TIMEOUT_MS` — retry + watchdog around `streamText`; raise the timeout if slow-but-healthy streams trip the watchdog.

Each map-reduce run logs one `[articleWorkflow:map-reduce] section grouping summary` (`console.info`) with window/word/section counts, distance stats, and per-section cut reasons — read it to see why a section count was chosen. A `(fallback)` label means the embedding pipeline failed and deterministic word-count chunking was used.
