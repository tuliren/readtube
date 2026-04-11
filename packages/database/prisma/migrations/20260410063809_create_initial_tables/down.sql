-- DropForeignKey
ALTER TABLE "UserSubscription"
    DROP CONSTRAINT "UserSubscription_user_id_fkey";

-- DropForeignKey
ALTER TABLE "UserSubscription"
    DROP CONSTRAINT "UserSubscription_channel_id_fkey";

-- DropForeignKey
ALTER TABLE "Video"
    DROP CONSTRAINT "Video_channel_id_fkey";

-- DropForeignKey
ALTER TABLE "Transcript"
    DROP CONSTRAINT "Transcript_video_id_fkey";

-- DropTable
DROP TABLE "User";

-- DropTable
DROP TABLE "Channel";

-- DropTable
DROP TABLE "UserSubscription";

-- DropTable
DROP TABLE "Video";

-- DropTable
DROP TABLE "Transcript";

-- DropEnum
DROP TYPE "UserSourceType";

-- DropEnum
DROP TYPE "VideoPlatformType";
