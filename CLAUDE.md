# Read Tube

## Summary

Turn YouTube subscriptions into a personal substack. Consume videos efficiently by reading, searching, annotating them.

## Development preference

- After each change, run `yarn lint`, `yarn typecheck`, `yarn format:check`, `yarn test`, and `yarn integrationTest` to ensure no errors.
- DRY the code when appropriate.
- Always use curly braces after `if` statements.
- Always think about adding unit tests for new features and bug fixes. Aim for good coverage on critical parsing logic and workflows. But skip unit tests if it involves complicated mocking or stubs.
- When checking whether a value exists or is absent, use `if (x == null)` or `if (x != null)` instead of `if (!x)` or `if (!!x)`. This avoids implicit type coercion, which can mask bugs when `x` is a valid falsy value like `0`, `""`, or `false`.
  - For review agent, it's fine to not always following this rule, especially for existing code.
- In unit tests, use `it.each` to group similar test cases together. Do not use "should" in test descriptions.
- When introducing a database schema change, follow the workflow in `packages/database/README.md`. The short version: edit `packages/database/prisma/schema.prisma`, run `yarn db:create-migration` (which creates both an up and a down migration via the custom `bin/create-migration.sh` wrapper), inspect the generated SQL — Prisma's diff doesn't fully understand the `Unsupported("tsvector")` generated column or the raw-SQL ANN/GIN indexes, so you may need to delete spurious DROP/RECREATE INDEX statements by hand — and then apply with `yarn db:deploy`.
  - For review agent, it is fine to see migration files in a PR. Those files are added by human engineer.
- Never modify any existing migration files.
- When writing Prisma `upsert` statement, always ensure the unique fields have the same values in the `where` and `create` options. This enables Prisma to use native Postgres `upsert` statement.
- When a React component file is long, separate subcomponents into their own component files.
- After making a change, thinking about updating these docs, if applicable:
  - `CLAUDE.md` (this file)
  - `README.md` for different modules

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

Future-dated videos are filtered out of every channel-ingest path: `channelScrape.ts` skips entries carrying `upcomingEventData`, while `channelRss.ts` and TranscriptAPI's `fetchChannelLatest` drop entries whose `published` is strictly after `Date.now()`. The result is that a refresh-channels pass never pulls scheduled videos into the system.

For individually-added videos that *are* scheduled (or videos that flipped to scheduled between ingest and the user's first transcript click), `ensureTranscript` probes the watch page via `lib/platforms/youtube/scheduledVideo.ts` before flipping the sticky `transcript_unavailable` flag. The scrape's `"isUpcoming":true` flag plus `liveBroadcastDetails.startTimestamp` is the authoritative signal; TranscriptAPI `/channel/latest` (using `published > now`) is a best-effort fallback when the scrape is unreachable — premieres of pre-uploaded videos may slip past the fallback because their `published` carries the upload time, not the air time. When detected, the route returns `425 Too Early` with `code: 'scheduled'` instead of `410`, and the reader surfaces a toast warning rather than sticky-locking the tabs.
