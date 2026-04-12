-- Drop ever-changing metadata columns that shouldn't be persisted.
ALTER TABLE "Channel" DROP COLUMN "subscriber_count";
ALTER TABLE "Video" DROP COLUMN "view_count";
