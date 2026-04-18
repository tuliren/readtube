-- AlterTable
-- NB: will fail if any Channel row currently has rss_url = NULL. In a
-- rollback, backfill those rows (e.g. delete Bilibili channels) before
-- re-enabling the NOT NULL constraint.
ALTER TABLE "Channel" ALTER COLUMN "rss_url" SET NOT NULL;

-- AlterEnum
-- Postgres doesn't support removing individual enum values. Recreate
-- the type without BILIBILI, repoint the columns that reference it,
-- drop the old type, then rename.
ALTER TYPE "VideoPlatformType" RENAME TO "VideoPlatformType_old";
CREATE TYPE "VideoPlatformType" AS ENUM ('YOUTUBE');
ALTER TABLE "Channel" ALTER COLUMN "source_type" DROP DEFAULT;
ALTER TABLE "Channel" ALTER COLUMN "source_type" TYPE "VideoPlatformType" USING "source_type"::text::"VideoPlatformType";
ALTER TABLE "Channel" ALTER COLUMN "source_type" SET DEFAULT 'YOUTUBE';
ALTER TABLE "Video" ALTER COLUMN "source_type" DROP DEFAULT;
ALTER TABLE "Video" ALTER COLUMN "source_type" TYPE "VideoPlatformType" USING "source_type"::text::"VideoPlatformType";
ALTER TABLE "Video" ALTER COLUMN "source_type" SET DEFAULT 'YOUTUBE';
ALTER TABLE "Playlist" ALTER COLUMN "source_type" DROP DEFAULT;
ALTER TABLE "Playlist" ALTER COLUMN "source_type" TYPE "VideoPlatformType" USING "source_type"::text::"VideoPlatformType";
ALTER TABLE "Playlist" ALTER COLUMN "source_type" SET DEFAULT 'YOUTUBE';
DROP TYPE "VideoPlatformType_old";
