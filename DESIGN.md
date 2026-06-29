# App Choices

## Channel snapshot fetching

`fetchChannelSnapshot` (`apps/web/src/lib/platforms/youtube/channelSnapshot.ts`) combines three sources. Scrape always contributes channel handle, logo, and per-video duration. The video list comes from RSS (primary), with TranscriptAPI `/channel/latest` as a fallback, and a scrape-only build as the last resort.

| Trigger | Scrape | RSS | TranscriptAPI |
|---|---|---|---|
| Add channel, cache hit | — | — | — |
| Add channel, `/channel/UC…` URL or bare UC ID | always (parallel) | primary | fallback (see below) |
| Add channel, `@handle` URL | always, **first** (resolves UC ID) | after scrape resolves UC | fallback (see below) |
| Refresh channel | always (parallel) | primary | fallback (see below) |

TranscriptAPI fires when **either** of these is true:
1. RSS threw (network error / 404).
2. Scrape and RSS both succeeded but each returned zero videos — observed when YouTube soft-blocks a hosting IP (e.g. Vercel) by serving 200s with empty channel pages and empty feeds. TranscriptAPI routes via different infrastructure.

When RSS + TranscriptAPI both fail, the scrape-only build marks every video `isScraped: true` so a later healthy RSS pass doesn't get clobbered (create-on-insert, skip-on-update).

## Scheduled premieres / upcoming livestreams

Channel-ingest paths drop future-dated videos: `channelScrape.ts` skips `upcomingEventData` entries; `channelRss.ts` and TranscriptAPI's `fetchChannelLatest` drop `published > now`. So refreshes never pull in scheduled videos.

For individually-added videos that are (or turn) scheduled, `ensureTranscript` probes the watch page (`scheduledVideo.ts`) before flipping the sticky `transcript_unavailable` flag — scrape's `isUpcoming` + `liveBroadcastDetails.startTimestamp` is authoritative, TranscriptAPI `/channel/latest` a fallback. Detected ones return `425` (`code: 'scheduled'`) so the reader shows a toast instead of sticky-locking.

## Members-only videos

`channelScrape.ts` drops members-only uploads (badge `BADGE_MEMBERS_ONLY` / `BADGE_STYLE_TYPE_MEMBERS_ONLY`) into `memberOnlyVideoIds`, which `mergeSnapshot` uses to drop matching RSS entries too. Their watch pages are paywalled — ingesting would only burn a transcript fetch and sticky-lock the entry as captionless.

## Generation usage & quota

Metered off the `UserRequest` audit log (no counter table); `lib/usage/quota.ts` derives it. Only `TRANSCRIPT` requests count toward `MONTHLY_GENERATION_QUOTA` (`getGenerationUsage`, UTC calendar month); `getLifetimeUsage` groups all-time counts by type. Rows are only written when work actually happened, so every row counts regardless of `outcome`. Surfaced read-only on `/usage`; no enforcement yet.

## Tuning article generation

Article generation picks between **single-pass** (one LLM call) and **map-reduce** (split the transcript into sections, generate in parallel, then a reduce pass consolidates the outline). Every knob lives in `apps/web/src/constants.ts` and is documented inline — the highlights:

- `MAP_REDUCE_THRESHOLD_MINUTES` — at/above uses map-reduce, below uses single-pass. Falls back to transcript reading time when `durationSeconds` is missing; set huge to disable map-reduce.
- `SECTION_TARGET_WORDS` — the one knob for section size; `MIN/MAX_SECTION_WORDS` derive from it (0.5×/2×). Lower for more, smaller sections.
- `MAX_SECTIONS`, `MAX_PARALLEL_SECTIONS`, `EMBED_WINDOW_WORDS`, `TOPIC_BOUNDARY_DISTANCE` — map-reduce caps, per-section concurrency, and the topic-shift cosine threshold (lower → more semantic cuts).
- `MAX_PRESTREAM_ATTEMPTS`, `STREAM_INACTIVITY_TIMEOUT_MS` — retry + watchdog around `streamText`; raise the timeout if slow-but-healthy streams trip the watchdog.

Each map-reduce run logs one `[articleWorkflow:map-reduce] section grouping summary` (`console.info`) with window/word/section counts, distance stats, and per-section cut reasons — read it to see why a section count was chosen. A `(fallback)` label means the embedding pipeline failed and deterministic word-count chunking was used.
