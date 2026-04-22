-- Add target-language support to Summary and Article. The column is
-- nullable: language IS NULL means "Original" — the row was generated
-- to match the transcript's source language, with no explicit target.
-- Detection happens lazily in the API route the first time a user picks
-- a non-null target for a given video.
--
-- Uniqueness used to be:
--   Summary: UNIQUE(transcript_id)
--   Article: UNIQUE(transcript_id, style)
--
-- It now needs to be:
--   Summary: UNIQUE(transcript_id, language) treating NULL as a value
--   Article: UNIQUE(transcript_id, style, language) treating NULL as a value
--
-- Postgres' default UNIQUE treats NULL as distinct (so multiple NULLs
-- pass), and Prisma 6.6 doesn't expose `nulls: NotDistinct` without a
-- preview feature. We use two partial unique indexes per table instead:
-- one for the NULL ("Original") row, one for the non-null rows.

-- AlterTable
ALTER TABLE "Article" ADD COLUMN "language" TEXT;

-- AlterTable
ALTER TABLE "Summary" ADD COLUMN "language" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN "preferred_language" TEXT;

-- DropIndex (replaced by the partial unique indexes below)
DROP INDEX "Article_transcript_id_style_key";
DROP INDEX "Summary_transcript_id_key";

-- CreateIndex (lookup index — covers both null and non-null language)
CREATE INDEX "Article_transcript_id_style_language_idx" ON "Article"("transcript_id", "style", "language");
CREATE INDEX "Summary_transcript_id_language_idx" ON "Summary"("transcript_id", "language");

-- CreateIndex (partial unique: at most one Original per (transcript_id, style))
CREATE UNIQUE INDEX "Article_transcript_id_style_original_key"
  ON "Article"("transcript_id", "style")
  WHERE "language" IS NULL;

-- CreateIndex (partial unique: at most one row per (transcript_id, style, language))
CREATE UNIQUE INDEX "Article_transcript_id_style_language_key"
  ON "Article"("transcript_id", "style", "language")
  WHERE "language" IS NOT NULL;

-- CreateIndex (partial unique: at most one Original per transcript_id)
CREATE UNIQUE INDEX "Summary_transcript_id_original_key"
  ON "Summary"("transcript_id")
  WHERE "language" IS NULL;

-- CreateIndex (partial unique: at most one row per (transcript_id, language))
CREATE UNIQUE INDEX "Summary_transcript_id_language_key"
  ON "Summary"("transcript_id", "language")
  WHERE "language" IS NOT NULL;
