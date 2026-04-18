-- DropIndex
DROP INDEX IF EXISTS "Channel_source_id_key";

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Channel_source_type_source_id_key" ON "Channel" ("source_type", "source_id");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Channel_source_type_handle_key" ON "Channel" ("source_type", "handle");
