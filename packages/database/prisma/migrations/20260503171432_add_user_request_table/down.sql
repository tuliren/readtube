-- Rollback the UserRequest table and its enums. The DROP/RECREATE on
-- video_search_tsv_idx and video_embedding_hnsw_idx that Prisma's
-- diff emitted have been removed by hand — those indexes are managed
-- by raw-SQL migrations and Prisma's diff doesn't understand them.

-- DropForeignKey
ALTER TABLE "UserRequest" DROP CONSTRAINT "UserRequest_user_id_fkey";

-- DropForeignKey
ALTER TABLE "UserRequest" DROP CONSTRAINT "UserRequest_video_id_fkey";

-- DropForeignKey
ALTER TABLE "UserRequest" DROP CONSTRAINT "UserRequest_transcript_id_fkey";

-- DropForeignKey
ALTER TABLE "UserRequest" DROP CONSTRAINT "UserRequest_summary_id_fkey";

-- DropForeignKey
ALTER TABLE "UserRequest" DROP CONSTRAINT "UserRequest_article_id_fkey";

-- DropTable
DROP TABLE "UserRequest";

-- DropEnum
DROP TYPE "UserRequestType";

-- DropEnum
DROP TYPE "UserRequestOutcome";
