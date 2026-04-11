-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "vector";

-- CreateEnum
CREATE TYPE "VideoTagSource" AS ENUM ('MANUAL', 'AUTO_RULE', 'AUTO_AI');

-- CreateEnum
CREATE TYPE "HighlightSource" AS ENUM ('TRANSCRIPT', 'SUMMARY', 'ARTICLE');

-- AlterTable
ALTER TABLE "UserSubscription" ADD COLUMN     "folder_id" TEXT,
ADD COLUMN     "mute_until" TIMESTAMP(3),
ADD COLUMN     "priority" INTEGER NOT NULL DEFAULT 0;

-- AlterTable: Video full-text search vector, stored + generated from title + description.
-- title gets weight A (highest rank), description gets weight B.
ALTER TABLE "Video" ADD COLUMN "search_tsv" tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce("title", '')), 'A') ||
    setweight(to_tsvector('english', coalesce("description", '')), 'B')
  ) STORED;

-- CreateTable
CREATE TABLE "Folder" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Folder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tag" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Tag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VideoTag" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "video_id" TEXT NOT NULL,
    "tag_id" TEXT NOT NULL,
    "source" "VideoTagSource" NOT NULL DEFAULT 'MANUAL',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VideoTag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VideoStar" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "video_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VideoStar_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VideoSave" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "video_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VideoSave_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VideoSnooze" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "video_id" TEXT NOT NULL,
    "snooze_until" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VideoSnooze_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VideoArchive" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "video_id" TEXT NOT NULL,
    "archived_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VideoArchive_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Note" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "video_id" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "timestamp_ms" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Note_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Highlight" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "video_id" TEXT NOT NULL,
    "source" "HighlightSource" NOT NULL,
    "anchor_start" INTEGER NOT NULL,
    "anchor_end" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Highlight_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Rule" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "conditions" JSONB NOT NULL,
    "actions" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Rule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SavedView" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "query" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SavedView_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserPreference" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "theme" TEXT NOT NULL DEFAULT 'system',
    "density" TEXT NOT NULL DEFAULT 'comfortable',
    "digest_enabled" BOOLEAN NOT NULL DEFAULT false,
    "digest_hour_utc" INTEGER NOT NULL DEFAULT 13,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserPreference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DigestRun" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "video_ids" JSONB NOT NULL,
    "email_status" TEXT NOT NULL,
    "error" TEXT,

    CONSTRAINT "DigestRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VideoEmbedding" (
    "id" TEXT NOT NULL,
    "video_id" TEXT NOT NULL,
    "embedding" vector(1536) NOT NULL,
    "model" TEXT NOT NULL,
    "prompt_version" TEXT NOT NULL,
    "generated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VideoEmbedding_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "folder_index_on_user_id" ON "Folder"("user_id");

-- CreateIndex
CREATE INDEX "tag_index_on_user_id" ON "Tag"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "Tag_user_id_name_key" ON "Tag"("user_id", "name");

-- CreateIndex
CREATE INDEX "video_tag_index_on_video_id" ON "VideoTag"("video_id");

-- CreateIndex
CREATE INDEX "video_tag_index_on_tag_id" ON "VideoTag"("tag_id");

-- CreateIndex
CREATE UNIQUE INDEX "VideoTag_user_id_video_id_tag_id_key" ON "VideoTag"("user_id", "video_id", "tag_id");

-- CreateIndex
CREATE INDEX "video_star_index_on_video_id" ON "VideoStar"("video_id");

-- CreateIndex
CREATE UNIQUE INDEX "VideoStar_user_id_video_id_key" ON "VideoStar"("user_id", "video_id");

-- CreateIndex
CREATE INDEX "video_save_index_on_video_id" ON "VideoSave"("video_id");

-- CreateIndex
CREATE UNIQUE INDEX "VideoSave_user_id_video_id_key" ON "VideoSave"("user_id", "video_id");

-- CreateIndex
CREATE INDEX "video_snooze_index_on_snooze_until" ON "VideoSnooze"("snooze_until");

-- CreateIndex
CREATE UNIQUE INDEX "VideoSnooze_user_id_video_id_key" ON "VideoSnooze"("user_id", "video_id");

-- CreateIndex
CREATE INDEX "video_archive_index_on_video_id" ON "VideoArchive"("video_id");

-- CreateIndex
CREATE UNIQUE INDEX "VideoArchive_user_id_video_id_key" ON "VideoArchive"("user_id", "video_id");

-- CreateIndex
CREATE INDEX "note_index_on_user_video" ON "Note"("user_id", "video_id");

-- CreateIndex
CREATE INDEX "highlight_index_on_user_video" ON "Highlight"("user_id", "video_id");

-- CreateIndex
CREATE INDEX "rule_index_on_user_id" ON "Rule"("user_id");

-- CreateIndex
CREATE INDEX "saved_view_index_on_user_id" ON "SavedView"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "UserPreference_user_id_key" ON "UserPreference"("user_id");

-- CreateIndex
CREATE INDEX "digest_run_index_on_user_sent_at" ON "DigestRun"("user_id", "sent_at");

-- CreateIndex
CREATE UNIQUE INDEX "VideoEmbedding_video_id_key" ON "VideoEmbedding"("video_id");

-- CreateIndex
CREATE INDEX "subscription_index_on_user_folder" ON "UserSubscription"("user_id", "folder_id");

-- AddForeignKey
ALTER TABLE "UserSubscription" ADD CONSTRAINT "UserSubscription_folder_id_fkey" FOREIGN KEY ("folder_id") REFERENCES "Folder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Folder" ADD CONSTRAINT "Folder_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("source_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tag" ADD CONSTRAINT "Tag_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("source_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoTag" ADD CONSTRAINT "VideoTag_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("source_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoTag" ADD CONSTRAINT "VideoTag_video_id_fkey" FOREIGN KEY ("video_id") REFERENCES "Video"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoTag" ADD CONSTRAINT "VideoTag_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoStar" ADD CONSTRAINT "VideoStar_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("source_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoStar" ADD CONSTRAINT "VideoStar_video_id_fkey" FOREIGN KEY ("video_id") REFERENCES "Video"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoSave" ADD CONSTRAINT "VideoSave_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("source_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoSave" ADD CONSTRAINT "VideoSave_video_id_fkey" FOREIGN KEY ("video_id") REFERENCES "Video"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoSnooze" ADD CONSTRAINT "VideoSnooze_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("source_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoSnooze" ADD CONSTRAINT "VideoSnooze_video_id_fkey" FOREIGN KEY ("video_id") REFERENCES "Video"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoArchive" ADD CONSTRAINT "VideoArchive_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("source_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoArchive" ADD CONSTRAINT "VideoArchive_video_id_fkey" FOREIGN KEY ("video_id") REFERENCES "Video"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Note" ADD CONSTRAINT "Note_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("source_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Note" ADD CONSTRAINT "Note_video_id_fkey" FOREIGN KEY ("video_id") REFERENCES "Video"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Highlight" ADD CONSTRAINT "Highlight_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("source_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Highlight" ADD CONSTRAINT "Highlight_video_id_fkey" FOREIGN KEY ("video_id") REFERENCES "Video"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rule" ADD CONSTRAINT "Rule_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("source_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedView" ADD CONSTRAINT "SavedView_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("source_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserPreference" ADD CONSTRAINT "UserPreference_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("source_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DigestRun" ADD CONSTRAINT "DigestRun_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("source_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoEmbedding" ADD CONSTRAINT "VideoEmbedding_video_id_fkey" FOREIGN KEY ("video_id") REFERENCES "Video"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- GIN index powering /api/search full-text search on Video.
CREATE INDEX "video_search_tsv_idx" ON "Video" USING GIN ("search_tsv");

-- HNSW index powering /api/inbox/ask semantic search over VideoEmbedding.
-- vector_cosine_ops pairs with the `<=>` cosine-distance operator.
CREATE INDEX "video_embedding_hnsw_idx" ON "VideoEmbedding"
  USING hnsw ("embedding" vector_cosine_ops);
