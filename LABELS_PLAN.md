# Unified Label Concept — Design & DB Preparation

## Context

Today ReadTube has four separate organization mechanisms:

- **Star / Save / Archive**: three identical per-user-per-video join tables (`VideoStar`, `VideoSave`, `VideoArchive`), surfaced as fixed sidebar Views, with query logic centralized in `apps/web/src/lib/inbox/buildWhere.ts` and writes in `lib/inbox/triageActions.ts`.
- **Folders**: channel grouping only, via nullable `UserSubscription.folder_id` → `Folder` (a channel is in at most one folder). Playlists and standalone videos cannot be grouped at all.
- **Playlists**: `Playlist`/`PlaylistVideo` many-to-many (user-owned content sources synced from YouTube).
- **Standalone videos**: `StandaloneVideo` library membership.

The goal is a Gmail-style label that unifies star/save/archive and generalizes folders to channels, playlists, and standalone videos. Decisions made:

- **Multi-label** (Gmail-style many-to-many), not single-folder semantics.
- The `UserSubscription` → `UserChannel` rename is **aborted**.
- **Naming convention**: user-scoped tables get a `User` prefix. First, in its own PR, rename `Playlist` → `UserPlaylist` and `StandaloneVideo` → `UserStandaloneVideo` (and `PlaylistVideo` → `UserPlaylistVideo`, which is user-scoped via its playlist). The label tables are `UserLabel`, `UserVideoLabel`, `UserSubscriptionLabel`, `UserPlaylistLabel`. Relation fields are named after the join table in snake_case (`user_video_labels`, `user_subscription_labels`, `user_playlist_labels`), never a generic `labels`.
- Few users today → few PRs, no dual-write ceremony.
- `Folder`, `VideoStar`, `VideoSave`, `VideoArchive` are also user-scoped but are **not** renamed — they get dropped at the end of this migration anyway.

## Assessment: does "label" make sense?

**Yes, with clear boundaries.** Labels replace *organizational* state, not *content* structures:

| Replaced by labels | Stays as-is |
|---|---|
| `VideoStar`/`VideoSave`/`VideoArchive` → 3 per-user **system labels** on videos | `UserPlaylist`/`UserPlaylistVideo` — playlists are ordered, synced content sources; they get *labeled*, not replaced |
| `Folder` + `UserSubscription.folder_id` → **user labels** on subscriptions (many-to-many) | `UserStandaloneVideo` — library membership axis |
| — (new capability) labels on playlists & standalone videos | Read state: `UserVideoConsumption` + `read_at` watermarks — orthogonal to labels |

Archive semantics carry over cleanly: "archived" = video carries the ARCHIVED system label; inbox default-excludes it (same shape as today's `archives: { none: ... }` in `buildWhere.ts`).

Prior art: a `Tag`/`VideoTag` system existed in migration `20260411075704_inbox_foundation` and was dropped in `20260422064248_delete_unused_tables` — the new design follows the same join-table conventions.

## PR 1 (first): rename user-scoped tables to `User*`

Rename `Playlist` → `UserPlaylist`, `PlaylistVideo` → `UserPlaylistVideo`, `StandaloneVideo` → `UserStandaloneVideo`. Columns keep their names (`playlist_id`, `video_id`, ...).

1. **Schema** (`packages/database/prisma/schema.prisma`): rename the three models; rename relation fields to the join-table pattern:
   - `User.playlists` → `user_playlists`, `User.standalone_videos` → `user_standalone_videos`
   - `Video.standalone` → `user_standalone_videos`, `Video.playlist_items` → `user_playlist_videos`
   - `Playlist.items` → `UserPlaylist.user_playlist_videos`
   - Rename client-side compound-unique names and index names: `playlist_unique_user_name` → `user_playlist_unique_user_name`, `playlist_unique_user_source` → `user_playlist_unique_user_source`, `playlist_video_unique_playlist_video` → `user_playlist_video_unique_playlist_video`, `playlist_video_index_on_video_id` → `user_playlist_video_index_on_video_id`, `standalone_video_unique_user_video` → `user_standalone_video_unique_user_video`, `standalone_video_index_on_video_id` → `user_standalone_video_index_on_video_id`.
2. **Migration**: `yarn db:create-migration` will generate DROP+CREATE for a model rename — **replace the generated SQL wholesale** with hand-written statements (README workflow anticipates hand-editing):
   - `ALTER TABLE "Playlist" RENAME TO "UserPlaylist";` (×3 tables)
   - `ALTER TABLE ... RENAME CONSTRAINT` for pkeys and FKs (`Playlist_pkey`, `Playlist_user_id_fkey`, `PlaylistVideo_playlist_id_fkey`, `PlaylistVideo_video_id_fkey`, `StandaloneVideo_user_id_fkey`, `StandaloneVideo_video_id_fkey` → `UserPlaylist_...` etc.)
   - `ALTER INDEX ... RENAME` for Prisma-default unique indexes (`Playlist_user_id_name_key`, `Playlist_user_id_source_type_source_id_key`, `PlaylistVideo_playlist_id_video_id_key`, `StandaloneVideo_user_id_video_id_key`) and the custom indexes above. Check exact current names against `prisma/schema_dump.sql`.
   - `down.sql` = the reverse ALTERs. Verify zero drift after deploy: `prisma migrate diff --from-schema-datasource --to-schema-datamodel prisma/schema.prisma` must be empty.
3. **Code**: mechanical rename across `apps/web` —
   - Prisma accessors: `prisma.playlist` → `prisma.userPlaylist`, `prisma.playlistVideo` → `prisma.userPlaylistVideo`, `prisma.standaloneVideo` → `prisma.userStandaloneVideo` (services, routes, ~18 test files). Types `Playlist`/`StandaloneVideo` imported from `@readtube/database` follow the new names.
   - Relation usages: `standalone: { some: ... }` / `playlist_items: { some: ... }` (IDOR check in `lib/inbox/triageActions.ts`, `lib/inbox/loadVideos.ts` library scope, `app/api/search/route.ts`, `lib/inbox/triage.ts`) → new field names; upsert `where` keys using the renamed compound-unique names (e.g. add-playlist/add-video workflows in `lib/workflows/`).
   - Raw SQL hardcoding table names: `app/api/search/route.ts` references `"StandaloneVideo"`, `"PlaylistVideo"`, `"Playlist"` — update to the new quoted names. Grep for `"Playlist` / `"StandaloneVideo` to catch all.
   - **Not** renamed: URL/API surface (`/api/playlists`, `/videos/standalone`), UI copy, `VideoData.isStandalone` — product wording, not table naming.
4. Run all checks; branch + PR via create-pr workflow.

## Target label schema (PR 2)

**Key decisions** (each weighed against alternatives):

1. **Per-entity join tables** (`UserVideoLabel`, `UserSubscriptionLabel`, `UserPlaylistLabel`), not a polymorphic `entity_type`+`entity_id` table. Prisma has no polymorphic relations; separate tables keep real FKs, cascades, and native upserts — the universal convention in this schema.
2. **Channel labels reference `UserSubscription.id`**, not `Channel.id`. Channel is global/shared; the subscription row is already user-scoped, cascades label assignments away on unsubscribe (matching today's `folder_id` behavior), and makes labeling an unfollowed channel unrepresentable. Shadow channels (no subscription) are labeled at the video level via `UserVideoLabel`.
3. **No `kind` column** — system-ness derives from `system_key != null` (house style per CLAUDE.md). `@@unique([user_id, system_key])` allows one system label per key (Postgres NULLS DISTINCT leaves user labels unaffected). The three system names ("Starred", "Read Later", "Archived") are reserved in the user-label create/rename path.
4. **`UserVideoLabel.user_id` is denormalized** from `UserLabel.user_id` (as the dropped `VideoTag` did): enables the per-page decoration query (`user_id = ? AND video_id IN (~50)`) and user-cascade without joining `UserLabel`. All writes flow through a helper that copies `label.user_id` — never raw client input.
5. **No nesting (`parent_id`), no per-label read watermark** for now — both are trivial additive migrations later; label-level mark-all-read is implementable by bumping member subscriptions'/playlists' `read_at`.

**Models to add** (enum with the other enums at top; models after `Folder`; style matches existing models):

```prisma
enum SystemLabelKey {
  STARRED
  READ_LATER
  ARCHIVED
}

// Gmail-style labels: user-owned, applied many-to-many to videos,
// channel subscriptions, and playlists. system_key != null marks the
// built-in star/read-later/archive labels (video-only, non-deletable,
// non-renamable — enforced in the app layer, created lazily via an
// idempotent ensure helper). Read state stays out of this system.
model UserLabel {
  id         String          @id @default(cuid())
  user_id    String
  name       String
  system_key SystemLabelKey?
  color      String?
  sort_order Int             @default(0)
  created_at DateTime        @default(now())
  updated_at DateTime        @updatedAt

  user                     User                    @relation(fields: [user_id], references: [source_id], onDelete: Cascade)
  user_video_labels        UserVideoLabel[]
  user_subscription_labels UserSubscriptionLabel[]
  user_playlist_labels     UserPlaylistLabel[]

  @@unique([user_id, name], name: "user_label_unique_user_name")
  @@unique([user_id, system_key], name: "user_label_unique_user_system_key")
}

model UserVideoLabel {
  id         String   @id @default(cuid())
  user_id    String   // denormalized from UserLabel.user_id — see design note
  label_id   String
  video_id   String
  created_at DateTime @default(now())

  user  User      @relation(fields: [user_id], references: [source_id], onDelete: Cascade)
  label UserLabel @relation(fields: [label_id], references: [id], onDelete: Cascade)
  video Video     @relation(fields: [video_id], references: [id], onDelete: Cascade)

  @@unique([label_id, video_id], name: "user_video_label_unique_label_video")
  @@index([user_id, video_id], name: "user_video_label_index_on_user_video")
  @@index([video_id], name: "user_video_label_index_on_video_id")
}

model UserSubscriptionLabel {
  id              String   @id @default(cuid())
  label_id        String
  subscription_id String
  created_at      DateTime @default(now())

  label        UserLabel        @relation(fields: [label_id], references: [id], onDelete: Cascade)
  subscription UserSubscription @relation(fields: [subscription_id], references: [id], onDelete: Cascade)

  @@unique([label_id, subscription_id], name: "user_subscription_label_unique_label_subscription")
  @@index([subscription_id], name: "user_subscription_label_index_on_subscription_id")
}

model UserPlaylistLabel {
  id          String   @id @default(cuid())
  label_id    String
  playlist_id String
  created_at  DateTime @default(now())

  label    UserLabel    @relation(fields: [label_id], references: [id], onDelete: Cascade)
  playlist UserPlaylist @relation(fields: [playlist_id], references: [id], onDelete: Cascade)

  @@unique([label_id, playlist_id], name: "user_playlist_label_unique_label_playlist")
  @@index([playlist_id], name: "user_playlist_label_index_on_playlist_id")
}
```

Back-relations: `User.user_labels UserLabel[]` + `User.user_video_labels UserVideoLabel[]`; `Video.user_video_labels UserVideoLabel[]`; `UserSubscription.user_subscription_labels UserSubscriptionLabel[]`; `UserPlaylist.user_playlist_labels UserPlaylistLabel[]`.

## System-label provisioning (when do the 3 default rows exist?)

Each user eventually has up to 3 `UserLabel` rows with `system_key` set. Design so their absence is never an error:

- **Created lazily, not at signup.** An idempotent `ensureSystemLabel(prisma, userId, key)` helper upserts on the `(user_id, system_key)` unique (identical where/create values → native Postgres `INSERT ... ON CONFLICT`, race-safe under concurrent requests). Every *write* path that needs a system label (star/save/archive toggle, bulk actions) calls it first. Existing users get theirs from the backfill script; new users get each row the first time they use that action. No signup hook, no seed step.
- **Reads tolerate absence by construction.** Read paths never look up the label row and then use its id; they filter through the relation: `user_video_labels: { some: { label: { user_id, system_key: 'STARRED' } } }`. If the row doesn't exist, `some` matches nothing (starred view is empty — semantically correct: the user has starred nothing) and `none` (the archived-exclusion default) is vacuously true (nothing hidden). No code path can throw on a missing system label.
- **Failure mode if a row somehow vanishes**: views render empty rather than erroring, and the next toggle recreates the row via the ensure helper. The backfill script doubles as a repair tool.

## Rollout: 4 PRs

| PR | Content | Visible change |
|---|---|---|
| **1 (first)** | `User*` rename: `UserPlaylist`, `UserPlaylistVideo`, `UserStandaloneVideo` (see above) | None |
| **2** | Label tables + idempotent backfill function/script + tests | None — tables sit empty |
| 3 | Full cutover: run backfill script, then deploy code that reads AND writes labels — `buildWhere.ts` label predicates, `triage.ts` decoration, `triageActions.ts` label writes, `/api/labels` CRUD, sidebar label sections replacing `FolderSection` (an entity may render under several labels; "ungrouped" = no user label), `InboxQuery.labelId`, `getChannelsForUser` raw SQL rewritten off `folder_id`. `views.ts` keys and the `/inbox?starred=1` URL contract stay intact | Labels UI |
| 4 (small, later) | Drop `VideoStar`/`VideoSave`/`VideoArchive`/`Folder` + `UserSubscription.folder_id` once PR 3 has soaked; rewrite remaining test seeds; `pg_dump -t` the four tables before deploy (down.sql restores schema only) | None |

PR 3 runbook: run `scripts/backfillLabels.ts` against prod (old code still live), deploy immediately after, re-run the script once post-deploy. The script is insert-only and idempotent, so re-runs are safe; with today's user count the seconds-wide window of untracked toggles is acceptable. Old tables freeze at deploy and remain as a rollback path until PR 4.

**Backfill mechanics**: TypeScript function (not SQL in a migration). Decisive reason: integration tests apply migrations to the testcontainer *before* seeding, so a migration-embedded `INSERT...SELECT` could never see seeded rows — untestable. A prisma-injected function is testable exactly like `triageActions.ts`, generates uniform cuids, and one implementation serves backfill and repair.

## PR 2 implementation detail

1. **Schema**: add the enum + 4 models + back-relations.
2. **Migration**: `yarn db:create-migration`; hand-inspect `migration.sql` (purely additive — delete any spurious tsvector/HNSW/trigram statements Prisma's diff emits for existing tables) and `down.sql` (drop 3 join tables, then `UserLabel`, then the enum). Apply with `yarn db:deploy`. Never touch existing migrations.
3. **Backfill function** `apps/web/src/lib/labels/backfillLabels.ts` (prisma as first arg, same injection pattern as `triageActions.ts`). Per user, insert-only and idempotent: `ensureSystemLabels` upserts; `VideoStar`/`VideoSave`/`VideoArchive` → `UserVideoLabel` via `createMany({ skipDuplicates: true })`; `Folder` → user `UserLabel` (preserve name/sort_order; suffix e.g. `"Starred (2)"` on collision with reserved system names) and `UserSubscription.folder_id` → `UserSubscriptionLabel`.
4. **Runner script** `apps/web/scripts/backfillLabels.ts` (follows `scripts/activeUsers.ts` precedent). Not executed in this PR.
5. **Tests** `apps/web/src/lib/__integrationTests__/backfillLabels.test.ts` (use `it.each`, no "should"): star/save/archive → labels; re-run produces no dupes; Folder + `folder_id` → user label + `UserSubscriptionLabel`; folder-name collision with "Starred"; `(user_id, system_key)` uniqueness; cascades on UserLabel delete / unsubscribe.
6. **Docs**: add a short "Labels" section to `DESIGN.md` recording the design decisions and phase plan (per CLAUDE.md's doc-update rule).

## Risks / edge cases

- PR 1's rename migration must be hand-written ALTERs (Prisma diff would emit DROP+CREATE and destroy data); verify drift-free with `prisma migrate diff` after deploy.
- Raw SQL is typecheck-invisible: PR 1 must fix `"Playlist"`/`"PlaylistVideo"`/`"StandaloneVideo"` literals (search route); PR 3 rewrites `us."folder_id"` in `lib/subscriptions.ts`; PR 4 grep-gates all dropped names before the drop.
- Unsubscribing cascades away that channel's `UserSubscriptionLabel` rows (matches today's folder behavior); re-subscribing doesn't restore them.
- Missing system label reads safely (see provisioning section) — lazy creation can't break the archived-exclusion default.

## Verification (per PR)

- `yarn lint && yarn typecheck && yarn format:check && yarn test && yarn integrationTest` all pass.
- PR 1: full integration suite is the main guard (playlist/standalone workflows are heavily covered); `yarn db:deploy` clean; `prisma migrate status` clean; `prisma migrate diff --from-schema-datasource --to-schema-datamodel` empty; regenerated `schema_dump.sql` shows renamed tables; `down.sql` round-trips (rollback → re-deploy) on the local DB.
- PR 2: new backfill integration tests pass against the testcontainer; `schema_dump.sql` shows only the 4 new tables + enum.
