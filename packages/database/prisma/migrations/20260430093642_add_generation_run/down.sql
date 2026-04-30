-- Rollback the GenerationRun table. In-flight workflow runs lose
-- their tap-in registry; clients that reload mid-generation will
-- fall back to the pre-feature behavior of seeing the Generate
-- button until the workflow's persist step lands.

-- DropForeignKey
ALTER TABLE "GenerationRun" DROP CONSTRAINT "GenerationRun_transcript_id_fkey";

-- DropIndex
DROP INDEX "GenerationRun_lookup_idx";
DROP INDEX "GenerationRun_summary_original_key";
DROP INDEX "GenerationRun_summary_language_key";
DROP INDEX "GenerationRun_article_original_key";
DROP INDEX "GenerationRun_article_language_key";

-- DropTable
DROP TABLE "GenerationRun";

-- DropEnum
DROP TYPE "GenerationKind";
