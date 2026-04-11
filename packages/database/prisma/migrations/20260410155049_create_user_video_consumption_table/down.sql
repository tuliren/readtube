-- DropForeignKey
ALTER TABLE "UserVideoConsumption"
    DROP CONSTRAINT "UserVideoConsumption_user_id_fkey";

-- DropForeignKey
ALTER TABLE "UserVideoConsumption"
    DROP CONSTRAINT "UserVideoConsumption_video_id_fkey";

-- AlterTable
ALTER TABLE "Video"
    ADD COLUMN "read_at" TIMESTAMP(3);

-- DropTable
DROP TABLE "UserVideoConsumption";
