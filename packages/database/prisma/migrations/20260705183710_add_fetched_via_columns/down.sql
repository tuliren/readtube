-- Rollback the fetched_via telemetry columns. The CreateIndex on
-- video_search_tsv_idx / video_embedding_hnsw_idx that Prisma's diff
-- emitted have been removed by hand — those indexes are managed by
-- raw-SQL migrations and Prisma's diff doesn't understand them.

-- AlterTable
ALTER TABLE "Channel" DROP COLUMN "fetched_via";

-- AlterTable
ALTER TABLE "Playlist" DROP COLUMN "fetched_via";

-- AlterTable
ALTER TABLE "Video" DROP COLUMN "fetched_via";
