-- Rollback the channel refresh-dedup columns. Both columns are
-- dropped without data preservation — the columns are
-- runtime-only state for in-flight workflows; nothing downstream
-- relies on the historical workflow_id values.

-- AlterTable: Channel
ALTER TABLE "Channel"
  DROP COLUMN "status",
  DROP COLUMN "workflow_id";

-- DropEnum
DROP TYPE "ChannelStatus";
