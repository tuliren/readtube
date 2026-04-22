-- DropForeignKey
ALTER TABLE "DigestRun"
    DROP CONSTRAINT "DigestRun_user_id_fkey";

-- DropForeignKey
ALTER TABLE "Highlight"
    DROP CONSTRAINT "Highlight_user_id_fkey";

-- DropForeignKey
ALTER TABLE "Highlight"
    DROP CONSTRAINT "Highlight_video_id_fkey";

-- DropForeignKey
ALTER TABLE "Rule"
    DROP CONSTRAINT "Rule_user_id_fkey";

-- DropForeignKey
ALTER TABLE "Tag"
    DROP CONSTRAINT "Tag_user_id_fkey";

-- DropForeignKey
ALTER TABLE "UserPreference"
    DROP CONSTRAINT "UserPreference_user_id_fkey";

-- DropForeignKey
ALTER TABLE "VideoTag"
    DROP CONSTRAINT "VideoTag_tag_id_fkey";

-- DropForeignKey
ALTER TABLE "VideoTag"
    DROP CONSTRAINT "VideoTag_user_id_fkey";

-- DropForeignKey
ALTER TABLE "VideoTag"
    DROP CONSTRAINT "VideoTag_video_id_fkey";

-- DropTable
DROP TABLE "DigestRun";

-- DropTable
DROP TABLE "Highlight";

-- DropTable
DROP TABLE "Rule";

-- DropTable
DROP TABLE "Tag";

-- DropTable
DROP TABLE "UserPreference";

-- DropTable
DROP TABLE "VideoTag";

-- DropEnum
DROP TYPE "HighlightSource";

-- DropEnum
DROP TYPE "VideoTagSource";
