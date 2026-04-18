-- AlterEnum
ALTER TYPE "VideoPlatformType" ADD VALUE 'BILIBILI';

-- AlterTable
ALTER TABLE "Channel" ALTER COLUMN "rss_url" DROP NOT NULL;
