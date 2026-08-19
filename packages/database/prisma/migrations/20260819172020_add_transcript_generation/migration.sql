-- CreateEnum
CREATE TYPE "TranscriptSource" AS ENUM ('CAPTIONS', 'GENERATED');

-- AlterTable
ALTER TABLE "Transcript" ADD COLUMN     "source" "TranscriptSource" NOT NULL DEFAULT 'CAPTIONS';

-- AlterTable
ALTER TABLE "Video" ADD COLUMN     "transcript_generation_error" TEXT,
ADD COLUMN     "transcript_generation_status" "GenerationStatus" NOT NULL DEFAULT 'READY',
ADD COLUMN     "transcript_generation_workflow_id" TEXT;
