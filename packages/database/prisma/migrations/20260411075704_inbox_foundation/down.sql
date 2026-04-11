-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "plpgsql" WITH SCHEMA "pg_catalog" VERSION "1.0";

-- DropForeignKey
ALTER TABLE "UserSubscription" DROP CONSTRAINT "UserSubscription_folder_id_fkey";

-- DropForeignKey
ALTER TABLE "Folder" DROP CONSTRAINT "Folder_user_id_fkey";

-- DropForeignKey
ALTER TABLE "Tag" DROP CONSTRAINT "Tag_user_id_fkey";

-- DropForeignKey
ALTER TABLE "VideoTag" DROP CONSTRAINT "VideoTag_user_id_fkey";

-- DropForeignKey
ALTER TABLE "VideoTag" DROP CONSTRAINT "VideoTag_video_id_fkey";

-- DropForeignKey
ALTER TABLE "VideoTag" DROP CONSTRAINT "VideoTag_tag_id_fkey";

-- DropForeignKey
ALTER TABLE "VideoStar" DROP CONSTRAINT "VideoStar_user_id_fkey";

-- DropForeignKey
ALTER TABLE "VideoStar" DROP CONSTRAINT "VideoStar_video_id_fkey";

-- DropForeignKey
ALTER TABLE "VideoSave" DROP CONSTRAINT "VideoSave_user_id_fkey";

-- DropForeignKey
ALTER TABLE "VideoSave" DROP CONSTRAINT "VideoSave_video_id_fkey";

-- DropForeignKey
ALTER TABLE "VideoSnooze" DROP CONSTRAINT "VideoSnooze_user_id_fkey";

-- DropForeignKey
ALTER TABLE "VideoSnooze" DROP CONSTRAINT "VideoSnooze_video_id_fkey";

-- DropForeignKey
ALTER TABLE "VideoArchive" DROP CONSTRAINT "VideoArchive_user_id_fkey";

-- DropForeignKey
ALTER TABLE "VideoArchive" DROP CONSTRAINT "VideoArchive_video_id_fkey";

-- DropForeignKey
ALTER TABLE "Note" DROP CONSTRAINT "Note_user_id_fkey";

-- DropForeignKey
ALTER TABLE "Note" DROP CONSTRAINT "Note_video_id_fkey";

-- DropForeignKey
ALTER TABLE "Highlight" DROP CONSTRAINT "Highlight_user_id_fkey";

-- DropForeignKey
ALTER TABLE "Highlight" DROP CONSTRAINT "Highlight_video_id_fkey";

-- DropForeignKey
ALTER TABLE "Rule" DROP CONSTRAINT "Rule_user_id_fkey";

-- DropForeignKey
ALTER TABLE "SavedView" DROP CONSTRAINT "SavedView_user_id_fkey";

-- DropForeignKey
ALTER TABLE "UserPreference" DROP CONSTRAINT "UserPreference_user_id_fkey";

-- DropForeignKey
ALTER TABLE "DigestRun" DROP CONSTRAINT "DigestRun_user_id_fkey";

-- DropForeignKey
ALTER TABLE "VideoEmbedding" DROP CONSTRAINT "VideoEmbedding_video_id_fkey";

-- DropIndex
DROP INDEX "subscription_index_on_user_folder";

-- AlterTable
ALTER TABLE "UserSubscription" DROP COLUMN "folder_id",
DROP COLUMN "mute_until",
DROP COLUMN "priority";

-- AlterTable
ALTER TABLE "Video" DROP COLUMN "search_tsv";

-- DropTable
DROP TABLE "Folder";

-- DropTable
DROP TABLE "Tag";

-- DropTable
DROP TABLE "VideoTag";

-- DropTable
DROP TABLE "VideoStar";

-- DropTable
DROP TABLE "VideoSave";

-- DropTable
DROP TABLE "VideoSnooze";

-- DropTable
DROP TABLE "VideoArchive";

-- DropTable
DROP TABLE "Note";

-- DropTable
DROP TABLE "Highlight";

-- DropTable
DROP TABLE "Rule";

-- DropTable
DROP TABLE "SavedView";

-- DropTable
DROP TABLE "UserPreference";

-- DropTable
DROP TABLE "DigestRun";

-- DropTable
DROP TABLE "VideoEmbedding";

-- DropEnum
DROP TYPE "VideoTagSource";

-- DropEnum
DROP TYPE "HighlightSource";

