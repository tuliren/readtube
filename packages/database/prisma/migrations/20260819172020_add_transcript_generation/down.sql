-- Rollback the transcript-generation columns. Prisma's diff also
-- emits spurious statements for the raw-SQL indexes and the
-- search_tsv generated column (it doesn't understand them); those
-- are removed by hand — this rollback only reverts what the up
-- migration actually created.

-- AlterTable: Video
ALTER TABLE "Video"
  DROP COLUMN "transcript_generation_error",
  DROP COLUMN "transcript_generation_status",
  DROP COLUMN "transcript_generation_workflow_id";

-- AlterTable: Transcript
ALTER TABLE "Transcript" DROP COLUMN "source";

-- DropEnum
DROP TYPE "TranscriptSource";
