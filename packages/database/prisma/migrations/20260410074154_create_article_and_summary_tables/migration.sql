-- CreateEnum
CREATE TYPE "ArticleStyle" AS ENUM ('NARRATIVE', 'DIALOG');

-- CreateTable
CREATE TABLE "Article"
(
    "id"             TEXT           NOT NULL,
    "transcript_id"  TEXT           NOT NULL,
    "style"          "ArticleStyle" NOT NULL,
    "prompt_version" TEXT           NOT NULL,
    "model"          TEXT           NOT NULL,
    "content"        TEXT           NOT NULL,
    "usage"          JSONB,
    "generated_at"   TIMESTAMP(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Article_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Summary"
(
    "id"             TEXT         NOT NULL,
    "transcript_id"  TEXT         NOT NULL,
    "headline"       TEXT,
    "short"          TEXT,
    "full"           TEXT,
    "prompt_version" TEXT         NOT NULL,
    "model"          TEXT         NOT NULL,
    "usage"          JSONB,
    "generated_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Summary_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Article_transcript_id_style_prompt_version_key" ON "Article" ("transcript_id", "style", "prompt_version");

-- CreateIndex
CREATE UNIQUE INDEX "Summary_transcript_id_key" ON "Summary" ("transcript_id");

-- AddForeignKey
ALTER TABLE "Article"
    ADD CONSTRAINT "Article_transcript_id_fkey" FOREIGN KEY ("transcript_id") REFERENCES "Transcript" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Summary"
    ADD CONSTRAINT "Summary_transcript_id_fkey" FOREIGN KEY ("transcript_id") REFERENCES "Transcript" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
