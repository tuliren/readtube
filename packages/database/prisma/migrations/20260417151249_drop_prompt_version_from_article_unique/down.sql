-- Rollback the unique-index change only. The dedupe step in the up
-- migration deleted older-version rows for three articles — those
-- bodies are gone and a rollback cannot bring them back.

-- DropIndex
DROP INDEX "Article_transcript_id_style_key";

-- CreateIndex
CREATE UNIQUE INDEX "Article_transcript_id_style_prompt_version_key"
  ON "Article"("transcript_id", "style", "prompt_version");
