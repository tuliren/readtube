-- AlterTable
ALTER TABLE "Video" ADD COLUMN "source_type" "VideoPlatformType" NOT NULL DEFAULT 'YOUTUBE';

-- DropIndex
DROP INDEX IF EXISTS "video_index_on_source_id";

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Video_source_type_source_id_key" ON "Video" ("source_type", "source_id");
