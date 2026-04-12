-- AlterTable: Drop channel metadata columns
ALTER TABLE "Channel"
    DROP COLUMN "handle",
    DROP COLUMN "description",
    DROP COLUMN "subscriber_count",
    DROP COLUMN "verified",
    DROP COLUMN "logo_url";

-- AlterTable: Drop video thumbnail + view count columns
ALTER TABLE "Video"
    DROP COLUMN "thumbnail_url",
    DROP COLUMN "view_count";
