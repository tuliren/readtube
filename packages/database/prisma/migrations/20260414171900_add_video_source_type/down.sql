-- DropIndex
DROP INDEX IF EXISTS "Video_source_type_source_id_key";

-- CreateIndex
CREATE INDEX IF NOT EXISTS "video_index_on_source_id" ON "Video" ("source_id");

-- AlterTable
ALTER TABLE "Video" DROP COLUMN "source_type";
