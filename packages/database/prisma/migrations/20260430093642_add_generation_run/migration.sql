-- Track in-flight Vercel Workflow runs for summary/article generation
-- so a second client (or the same client after a refresh) can tap into
-- an existing stream instead of starting a duplicate workflow. The row
-- is created when the route first calls `start()` and deleted by the
-- workflow's persist step on success.
--
-- Uniqueness rules:
--   SUMMARY: at most one row per (transcript_id, kind=SUMMARY, language)
--           — language NULL = "Original".
--   ARTICLE: at most one row per (transcript_id, kind=ARTICLE, style, language)
--           — language NULL = "Original".
--
-- We use partial unique indexes per kind so the same `style` and
-- `language` columns can hold different shapes for the two kinds:
-- SUMMARY rows always have style IS NULL, ARTICLE rows always have
-- style IS NOT NULL. Postgres treats NULL as distinct under a plain
-- UNIQUE, so without partial indexes a second SUMMARY run for an
-- Original-language slot would happily insert.

-- CreateEnum
CREATE TYPE "GenerationKind" AS ENUM ('SUMMARY', 'ARTICLE');

-- CreateTable
CREATE TABLE "GenerationRun" (
    "id" TEXT NOT NULL,
    "transcript_id" TEXT NOT NULL,
    "kind" "GenerationKind" NOT NULL,
    "language" TEXT,
    "style" "ArticleStyle",
    "run_id" TEXT NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GenerationRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex (lookup — covers both null and non-null language/style)
CREATE INDEX "GenerationRun_lookup_idx" ON "GenerationRun"("transcript_id", "kind", "language", "style");

-- CreateIndex (partial unique: at most one summary Original per transcript)
CREATE UNIQUE INDEX "GenerationRun_summary_original_key"
  ON "GenerationRun"("transcript_id")
  WHERE "kind" = 'SUMMARY' AND "language" IS NULL;

-- CreateIndex (partial unique: at most one summary per (transcript_id, language))
CREATE UNIQUE INDEX "GenerationRun_summary_language_key"
  ON "GenerationRun"("transcript_id", "language")
  WHERE "kind" = 'SUMMARY' AND "language" IS NOT NULL;

-- CreateIndex (partial unique: at most one article Original per (transcript_id, style))
CREATE UNIQUE INDEX "GenerationRun_article_original_key"
  ON "GenerationRun"("transcript_id", "style")
  WHERE "kind" = 'ARTICLE' AND "language" IS NULL;

-- CreateIndex (partial unique: at most one article per (transcript_id, style, language))
CREATE UNIQUE INDEX "GenerationRun_article_language_key"
  ON "GenerationRun"("transcript_id", "style", "language")
  WHERE "kind" = 'ARTICLE' AND "language" IS NOT NULL;

-- AddForeignKey
ALTER TABLE "GenerationRun" ADD CONSTRAINT "GenerationRun_transcript_id_fkey"
  FOREIGN KEY ("transcript_id") REFERENCES "Transcript"("id") ON DELETE CASCADE ON UPDATE CASCADE;
