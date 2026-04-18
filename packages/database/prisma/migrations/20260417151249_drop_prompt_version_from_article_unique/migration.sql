-- Drop `prompt_version` from the Article unique constraint. The column
-- stays as record-keeping metadata, but prompt-version bumps no longer
-- create a parallel row alongside the previous generation; the cache
-- lookup keys on (transcript_id, style) alone.
--
-- Existing production data has 3 videos with multiple prompt-version
-- rows for the same (transcript_id, style). Collapse each group to the
-- most recent `generated_at` row; the older versions are dropped so
-- the new unique constraint can be applied without collision. This is
-- a one-way data migration — the down migration cannot restore the
-- deleted bodies.

-- Dedupe: keep the row with the largest generated_at per (transcript_id, style).
DELETE FROM "Article" a
USING "Article" b
WHERE a.transcript_id = b.transcript_id
  AND a.style = b.style
  AND (a.generated_at < b.generated_at
       OR (a.generated_at = b.generated_at AND a.id < b.id));

-- DropIndex
DROP INDEX "Article_transcript_id_style_prompt_version_key";

-- CreateIndex
CREATE UNIQUE INDEX "Article_transcript_id_style_key" ON "Article"("transcript_id", "style");
