-- AlterTable
-- Mirror of the up migration: drop only the two columns we added.
-- We deliberately do NOT touch search_tsv or its GIN index, nor the
-- VideoEmbedding HNSW index — those are managed by the
-- inbox_foundation migration's raw SQL and the Prisma diff doesn't
-- model them correctly.
ALTER TABLE "Video"
    DROP COLUMN "duration_seconds",
    DROP COLUMN "transcript_unavailable";
