-- DropIndex
DROP INDEX IF EXISTS "Channel_source_type_source_id_key";

-- DropIndex
DROP INDEX IF EXISTS "Channel_source_type_handle_key";

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Channel_source_id_key" ON "Channel" ("source_id" ASC);
