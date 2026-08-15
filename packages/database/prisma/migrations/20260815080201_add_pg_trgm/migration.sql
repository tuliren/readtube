-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- Trigram GIN indexes backing fast ILIKE substring search on video
-- title/description. Used by the CJK-query path of /api/search and
-- the inbox search: the english-config tsvector powering
-- video_search_tsv_idx cannot tokenize unsegmented CJK text, so CJK
-- queries fall back to substring matching instead.
--
-- NOTE: Prisma's diff also wanted to drop/recreate video_search_tsv_idx,
-- video_embedding_hnsw_idx, and the search_tsv generated-column default
-- (it doesn't understand the Unsupported("tsvector") column) — those
-- statements were removed by hand per the workflow in
-- packages/database/README.md.
CREATE INDEX "video_title_trgm_idx" ON "Video" USING GIN ("title" gin_trgm_ops);

CREATE INDEX "video_description_trgm_idx" ON "Video" USING GIN ("description" gin_trgm_ops);
