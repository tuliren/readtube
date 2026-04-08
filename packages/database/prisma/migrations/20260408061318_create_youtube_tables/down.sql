-- DropForeignKey
ALTER TABLE "Video"
DROP CONSTRAINT "Video_channelId_fkey";

-- DropTable
DROP TABLE "Channel";

-- DropTable
DROP TABLE "Video";
