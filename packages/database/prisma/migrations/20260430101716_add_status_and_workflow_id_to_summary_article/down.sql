-- Rollback the in-flight registry merge. Article.content has to come
-- back NOT NULL, which means any rows still in the GENERATING state
-- (no content yet) have to be deleted first.

-- Clean up rows that exist only to mark in-flight workflows so the
-- NOT NULL restoration on Article.content doesn't fail.
DELETE FROM "Article" WHERE "status" = 'GENERATING' AND "content" IS NULL;
DELETE FROM "Summary" WHERE "status" = 'GENERATING';

-- AlterTable: Summary
ALTER TABLE "Summary"
  DROP COLUMN "status",
  DROP COLUMN "workflow_id";

-- AlterTable: Article
ALTER TABLE "Article"
  DROP COLUMN "status",
  DROP COLUMN "workflow_id",
  ALTER COLUMN "content" SET NOT NULL;

-- DropEnum
DROP TYPE "GenerationStatus";
