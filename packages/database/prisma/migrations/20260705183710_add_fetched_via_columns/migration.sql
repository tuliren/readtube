-- Telemetry column: which fetch approach produced each YouTube-sourced
-- entity (data_api | rss | scrape | transcript_api). Nullable and
-- backfilled going forward; existing rows stay NULL. Lets us measure
-- how often the scrape / RSS / TranscriptAPI fallbacks fire behind the
-- Data API.
--
-- The DROP INDEX on video_search_tsv_idx / video_embedding_hnsw_idx and
-- the `ALTER COLUMN search_tsv DROP DEFAULT` that Prisma's diff emitted
-- have been removed by hand — those are managed by raw-SQL migrations
-- and Prisma's diff doesn't understand the tsvector generated column or
-- the ANN/GIN indexes.

-- AlterTable
ALTER TABLE "Channel" ADD COLUMN "fetched_via" TEXT;

-- AlterTable
ALTER TABLE "Playlist" ADD COLUMN "fetched_via" TEXT;

-- AlterTable
ALTER TABLE "Video" ADD COLUMN "fetched_via" TEXT;
