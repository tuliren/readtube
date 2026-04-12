-- AlterTable: Channel metadata from TranscriptAPI
ALTER TABLE "Channel"
    ADD COLUMN "handle" TEXT,
    ADD COLUMN "description" TEXT,
    ADD COLUMN "subscriber_count" INTEGER,
    ADD COLUMN "verified" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "logo_url" TEXT;

-- AlterTable: Video thumbnail + view count from TranscriptAPI RSS
ALTER TABLE "Video"
    ADD COLUMN "thumbnail_url" TEXT,
    ADD COLUMN "view_count" INTEGER;
