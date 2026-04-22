-- Rollback language support on Summary and Article.
-- Any rows with language IS NOT NULL will collide with the old
-- UNIQUE(transcript_id) / UNIQUE(transcript_id, style) constraints
-- after this migration reverts. Delete translated rows first, keeping
-- one row per (transcript_id [, style]) — the Original if it exists,
-- otherwise the most recently generated row.
DELETE FROM "Summary" s
USING "Summary" keep
WHERE s.transcript_id = keep.transcript_id
  AND s.id <> keep.id
  AND keep.id = (
    SELECT id FROM "Summary"
    WHERE transcript_id = s.transcript_id
    ORDER BY (language IS NOT NULL), generated_at DESC
    LIMIT 1
  );

DELETE FROM "Article" a
USING "Article" keep
WHERE a.transcript_id = keep.transcript_id
  AND a.style = keep.style
  AND a.id <> keep.id
  AND keep.id = (
    SELECT id FROM "Article"
    WHERE transcript_id = a.transcript_id AND style = a.style
    ORDER BY (language IS NOT NULL), generated_at DESC
    LIMIT 1
  );

-- DropIndex (partial unique indexes + lookup index)
DROP INDEX "Article_transcript_id_style_language_idx";
DROP INDEX "Article_transcript_id_style_language_key";
DROP INDEX "Article_transcript_id_style_original_key";
DROP INDEX "Summary_transcript_id_language_idx";
DROP INDEX "Summary_transcript_id_language_key";
DROP INDEX "Summary_transcript_id_original_key";

-- AlterTable
ALTER TABLE "User" DROP COLUMN "preferred_language";
ALTER TABLE "Article" DROP COLUMN "language";
ALTER TABLE "Summary" DROP COLUMN "language";

-- CreateIndex (restore pre-migration uniques)
CREATE UNIQUE INDEX "Article_transcript_id_style_key" ON "Article"("transcript_id", "style");
CREATE UNIQUE INDEX "Summary_transcript_id_key" ON "Summary"("transcript_id");
