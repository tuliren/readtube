-- DropForeignKey
ALTER TABLE "Article"
    DROP CONSTRAINT "Article_transcript_id_fkey";

-- DropForeignKey
ALTER TABLE "Summary"
    DROP CONSTRAINT "Summary_transcript_id_fkey";

-- DropTable
DROP TABLE "Article";

-- DropTable
DROP TABLE "Summary";

-- DropEnum
DROP TYPE "ArticleStyle";
