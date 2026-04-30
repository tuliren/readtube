-- Merge the in-flight workflow registry into the existing Summary
-- and Article tables. A row's lifecycle:
--
--   [no row] --claim--> GENERATING --persist OK--> READY
--                          |
--                          +-- persist fail (fresh row)  --> DELETE
--                          +-- persist fail (regen row)  --> revert to READY (old content stays)
--
-- `status = READY` is the canonical "cached content" state — every
-- read path (the route's GET cache lookup, findOrCloneSummary /
-- findOrCloneArticle, the inbox `hasSummary`/`hasArticle` count
-- derivation) filters on it. `workflow_id` records the most recent
-- workflow that wrote (or attempted to write) the row and is
-- intentionally kept after the workflow completes for trace/audit;
-- it's NULL only on rows that predate this migration.
--
-- Article.content drops NOT NULL because a row in GENERATING state
-- exists before any content has been persisted.

-- CreateEnum
CREATE TYPE "GenerationStatus" AS ENUM ('GENERATING', 'READY');

-- AlterTable: Summary
ALTER TABLE "Summary"
  ADD COLUMN "status"      "GenerationStatus" NOT NULL DEFAULT 'READY',
  ADD COLUMN "workflow_id" TEXT;

-- AlterTable: Article
ALTER TABLE "Article"
  ALTER COLUMN "content" DROP NOT NULL,
  ADD COLUMN "status"      "GenerationStatus" NOT NULL DEFAULT 'READY',
  ADD COLUMN "workflow_id" TEXT;

-- The existing (transcript_id, language) and (transcript_id, style,
-- language) indexes on Summary and Article already cover the
-- "is there an in-flight run for this slot?" lookup — the route adds
-- `status = GENERATING` as an inline filter and Postgres reuses those
-- indexes. No additional indexes are added here.
