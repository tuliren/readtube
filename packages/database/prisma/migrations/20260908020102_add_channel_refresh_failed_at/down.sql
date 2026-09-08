-- Rollback the refresh_failed_at column. Prisma's diff also emitted
-- spurious statements for the raw-SQL indexes and the search_tsv
-- generated column (it doesn't understand them); those were removed
-- by hand — this rollback only reverts what the up migration created.

-- AlterTable
ALTER TABLE "Channel" DROP COLUMN "refresh_failed_at";
