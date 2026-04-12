-- Recreate the dropped tables. Mirrors the original CREATE statements
-- from the inbox_foundation migration.

-- CreateTable
CREATE TABLE "VideoSnooze" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "video_id" TEXT NOT NULL,
    "snooze_until" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "VideoSnooze_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SavedView" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "query" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SavedView_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "video_snooze_index_on_snooze_until" ON "VideoSnooze" ("snooze_until");
CREATE UNIQUE INDEX "VideoSnooze_user_id_video_id_key" ON "VideoSnooze" ("user_id", "video_id");
CREATE INDEX "saved_view_index_on_user_id" ON "SavedView" ("user_id");

-- AddForeignKey
ALTER TABLE "VideoSnooze"
    ADD CONSTRAINT "VideoSnooze_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User" ("source_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VideoSnooze"
    ADD CONSTRAINT "VideoSnooze_video_id_fkey" FOREIGN KEY ("video_id") REFERENCES "Video" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SavedView"
    ADD CONSTRAINT "SavedView_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User" ("source_id") ON DELETE CASCADE ON UPDATE CASCADE;
