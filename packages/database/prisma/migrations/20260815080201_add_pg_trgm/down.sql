-- Drop the trigram indexes and the pg_trgm extension added by the up
-- migration. (The spurious tsvector/HNSW statements Prisma's diff
-- generated were removed by hand — see migration.sql.)
DROP INDEX IF EXISTS "video_description_trgm_idx";

DROP INDEX IF EXISTS "video_title_trgm_idx";

DROP EXTENSION IF EXISTS "pg_trgm";
