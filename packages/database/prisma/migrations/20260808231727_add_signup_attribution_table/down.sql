-- Rollback the SignupAttribution table. The CREATE EXTENSION, the SET
-- DEFAULT on Video.search_tsv, and the CREATE INDEX on
-- video_search_tsv_idx / video_embedding_hnsw_idx that Prisma's diff
-- emitted have been removed by hand — those are managed by raw-SQL
-- migrations and Prisma's diff doesn't understand them.

-- DropForeignKey
ALTER TABLE "SignupAttribution" DROP CONSTRAINT "SignupAttribution_user_id_fkey";

-- DropTable
DROP TABLE "SignupAttribution";
