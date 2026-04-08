-- DropForeignKey
ALTER TABLE "Channel"
DROP CONSTRAINT "Channel_user_id_fkey";

-- DropForeignKey
ALTER TABLE "Video"
DROP CONSTRAINT "Video_channel_id_fkey";

-- DropForeignKey
ALTER TABLE "Transcript"
DROP CONSTRAINT "Transcript_video_id_fkey";

-- AlterTable
ALTER TABLE "ClerkUser"
DROP CONSTRAINT "ClerkUser_pkey",
DROP COLUMN "id",
ADD COLUMN "id" BIGSERIAL NOT NULL,
ADD CONSTRAINT "ClerkUser_pkey" PRIMARY KEY ("id");

-- DropTable
DROP TABLE "Channel";

-- DropTable
DROP TABLE "Video";

-- DropTable
DROP TABLE "Transcript";
