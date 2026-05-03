-- Per-user, per-request audit log spanning transcript fetch and
-- summary/article generation flows. Layered alongside the shared cache
-- rows (Summary/Article) — those keep their own model/prompt_version/
-- usage as the canonical "what produced the cached row" record;
-- UserRequest is the immutable per-event log so a regen overwriting
-- the cache row doesn't erase prior attributions.
--
-- Two enums (UserRequestType, UserRequestOutcome) are introduced; see
-- schema.prisma for the per-value comments. The DROP/RECREATE on
-- video_search_tsv_idx and video_embedding_hnsw_idx that Prisma's diff
-- emitted have been removed by hand — those indexes are managed by
-- raw-SQL migrations and Prisma's diff doesn't understand them.

-- CreateEnum
CREATE TYPE "UserRequestType" AS ENUM ('TRANSCRIPT', 'SUMMARY', 'ARTICLE');

-- CreateEnum
-- Outcome enum is intentionally narrow: only terminal events that
-- bear real cost to the user. Transient blips (retried automatically)
-- and zero-cost short-circuits (cache hits, taps, sticky-unavailable
-- bounces, IDOR misses) are NOT recorded and so don't appear here.
CREATE TYPE "UserRequestOutcome" AS ENUM ('GENERATED', 'UNAVAILABLE', 'FAILED');

-- CreateTable
CREATE TABLE "UserRequest" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "type" "UserRequestType" NOT NULL,
    "outcome" "UserRequestOutcome" NOT NULL,
    "video_id" TEXT NOT NULL,
    "transcript_id" TEXT,
    "summary_id" TEXT,
    "article_id" TEXT,
    "language" TEXT,
    "style" "ArticleStyle",
    "prompt_version" TEXT,
    "model" TEXT,
    "usage" JSONB,
    "workflow_id" TEXT,
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "UserRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "user_request_index_on_user_created" ON "UserRequest"("user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "user_request_index_on_user_type_created" ON "UserRequest"("user_id", "type", "created_at" DESC);

-- CreateIndex
CREATE INDEX "user_request_index_on_video" ON "UserRequest"("video_id");

-- AddForeignKey
ALTER TABLE "UserRequest" ADD CONSTRAINT "UserRequest_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("source_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRequest" ADD CONSTRAINT "UserRequest_video_id_fkey" FOREIGN KEY ("video_id") REFERENCES "Video"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRequest" ADD CONSTRAINT "UserRequest_transcript_id_fkey" FOREIGN KEY ("transcript_id") REFERENCES "Transcript"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRequest" ADD CONSTRAINT "UserRequest_summary_id_fkey" FOREIGN KEY ("summary_id") REFERENCES "Summary"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRequest" ADD CONSTRAINT "UserRequest_article_id_fkey" FOREIGN KEY ("article_id") REFERENCES "Article"("id") ON DELETE SET NULL ON UPDATE CASCADE;
