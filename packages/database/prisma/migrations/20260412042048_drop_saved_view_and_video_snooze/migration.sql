-- DropForeignKey
ALTER TABLE "SavedView" DROP CONSTRAINT "SavedView_user_id_fkey";

-- DropForeignKey
ALTER TABLE "VideoSnooze" DROP CONSTRAINT "VideoSnooze_user_id_fkey";

-- DropForeignKey
ALTER TABLE "VideoSnooze" DROP CONSTRAINT "VideoSnooze_video_id_fkey";

-- DropTable
DROP TABLE "SavedView";

-- DropTable
DROP TABLE "VideoSnooze";
