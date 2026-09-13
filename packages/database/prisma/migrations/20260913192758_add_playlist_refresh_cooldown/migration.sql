-- AlterTable
ALTER TABLE "Playlist"
ADD COLUMN "checked_at" TIMESTAMP(3),
ADD COLUMN "refresh_started_at" TIMESTAMP(3);
