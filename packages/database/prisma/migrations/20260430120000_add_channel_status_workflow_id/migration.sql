-- Refresh-dedup state for Channel rows. A row's lifecycle:
--
--   READY (default) --claim--> REFRESHING --release--> READY
--
-- `status = REFRESHING` + `workflow_id = <runId>` means a manual or
-- cron refresh workflow is currently fetching the upstream snapshot
-- and upserting videos. The manual single-channel refresh route uses
-- this to return 429 instead of starting a duplicate workflow; the
-- cron's per-channel step uses it to skip rows already claimed by
-- another path.
--
-- `workflow_id` is kept after the workflow completes (audit trail)
-- and on failure (used by the next caller to detect a stale
-- REFRESHING marker via getRun(workflow_id).status).
--
-- The add-channel path does NOT touch these columns. Concurrent adds
-- of the same channel are safe by construction (idempotent upsert
-- on `(source_type, source_id)` and `video_unique_source`); marking
-- REFRESHING from the add path would only complicate the dedup logic
-- on the refresh routes.

-- CreateEnum
CREATE TYPE "ChannelStatus" AS ENUM ('REFRESHING', 'READY');

-- AlterTable: Channel
ALTER TABLE "Channel"
  ADD COLUMN "status"      "ChannelStatus" NOT NULL DEFAULT 'READY',
  ADD COLUMN "workflow_id" TEXT;

-- The existing primary-key index on Channel.id already covers the
-- single-row claim/release lookups (updateMany WHERE id = ?). The
-- cron's `fetchStaleChannels` adds `status = READY` as an inline
-- filter on top of its existing `(checked_at, subscriptions)` query
-- shape; not worth a dedicated index for the cron's BATCH_SIZE-bounded
-- scan.
