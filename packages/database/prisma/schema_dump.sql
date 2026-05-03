-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "vector";

-- CreateEnum
CREATE TYPE "UserSourceType" AS ENUM ('CLERK');

-- CreateEnum
CREATE TYPE "VideoPlatformType" AS ENUM ('YOUTUBE', 'BILIBILI');

-- CreateEnum
CREATE TYPE "ArticleStyle" AS ENUM ('NARRATIVE', 'DIALOG');

-- CreateEnum
CREATE TYPE "GenerationStatus" AS ENUM ('GENERATING', 'READY');

-- CreateEnum
CREATE TYPE "ChannelStatus" AS ENUM ('REFRESHING', 'READY');

-- CreateEnum
CREATE TYPE "UserRequestType" AS ENUM ('TRANSCRIPT', 'SUMMARY', 'ARTICLE');

-- CreateEnum
CREATE TYPE "UserRequestOutcome" AS ENUM ('GENERATED', 'UNAVAILABLE', 'FAILED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "source_type" "UserSourceType" NOT NULL DEFAULT 'CLERK',
    "source_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "image" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "preferred_language" TEXT,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Channel" (
    "id" TEXT NOT NULL,
    "source_type" "VideoPlatformType" NOT NULL DEFAULT 'YOUTUBE',
    "source_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "rss_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "handle" TEXT,
    "description" TEXT,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "logo_url" TEXT,
    "checked_at" TIMESTAMP(3),
    "status" "ChannelStatus" NOT NULL DEFAULT 'READY',
    "workflow_id" TEXT,

    CONSTRAINT "Channel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserSubscription" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "channel_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "read_at" TIMESTAMP(3),
    "folder_id" TEXT,
    "mute_until" TIMESTAMP(3),
    "priority" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "UserSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Video" (
    "id" TEXT NOT NULL,
    "channel_id" TEXT NOT NULL,
    "source_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "published_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "search_tsv" tsvector DEFAULT (setweight(to_tsvector('english'::regconfig, COALESCE(title, ''::text)), 'A'::"char") || setweight(to_tsvector('english'::regconfig, COALESCE(description, ''::text)), 'B'::"char")),
    "duration_seconds" INTEGER,
    "transcript_unavailable" BOOLEAN NOT NULL DEFAULT false,
    "thumbnail_url" TEXT,
    "source_type" "VideoPlatformType" NOT NULL DEFAULT 'YOUTUBE',

    CONSTRAINT "Video_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserVideoConsumption" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "video_id" TEXT NOT NULL,
    "read_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserVideoConsumption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transcript" (
    "id" TEXT NOT NULL,
    "video_id" TEXT NOT NULL,
    "language" TEXT,
    "text" TEXT NOT NULL,
    "fetched_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Transcript_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Article" (
    "id" TEXT NOT NULL,
    "transcript_id" TEXT NOT NULL,
    "style" "ArticleStyle" NOT NULL,
    "prompt_version" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "content" TEXT,
    "usage" JSONB,
    "generated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "language" TEXT,
    "status" "GenerationStatus" NOT NULL DEFAULT 'READY',
    "workflow_id" TEXT,

    CONSTRAINT "Article_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Summary" (
    "id" TEXT NOT NULL,
    "transcript_id" TEXT NOT NULL,
    "headline" TEXT,
    "short" TEXT,
    "full" TEXT,
    "prompt_version" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "usage" JSONB,
    "generated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "language" TEXT,
    "status" "GenerationStatus" NOT NULL DEFAULT 'READY',
    "workflow_id" TEXT,

    CONSTRAINT "Summary_pkey" PRIMARY KEY ("id")
);

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
CREATE TABLE "VideoArchive" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "video_id" TEXT NOT NULL,
    "archived_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VideoArchive_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StandaloneVideo" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "video_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StandaloneVideo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Playlist" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "source_type" "VideoPlatformType" NOT NULL DEFAULT 'YOUTUBE',
    "source_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "read_at" TIMESTAMP(3),
    "custom_name" TEXT,

    CONSTRAINT "Playlist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlaylistVideo" (
    "id" TEXT NOT NULL,
    "playlist_id" TEXT NOT NULL,
    "video_id" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlaylistVideo_pkey" PRIMARY KEY ("id")
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
CREATE TABLE "VideoEmbedding" (
    "id" TEXT NOT NULL,
    "video_id" TEXT NOT NULL,
    "embedding" vector NOT NULL,
    "model" TEXT NOT NULL,
    "prompt_version" TEXT NOT NULL,
    "generated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VideoEmbedding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserRequest" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "type" "UserRequestType" NOT NULL,
    "outcome" "UserRequestOutcome" NOT NULL,
    "video_id" TEXT NOT NULL,
    "transcript_id" TEXT,
    "summary_id" TEXT,
    "article_id" TEXT,
    "language" TEXT,
    "style" "ArticleStyle",
    "prompt_version" TEXT,
    "model" TEXT,
    "usage" JSONB,
    "workflow_id" TEXT,
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "UserRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_source_id_key" ON "User"("source_id");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Channel_source_type_source_id_key" ON "Channel"("source_type", "source_id");

-- CreateIndex
CREATE UNIQUE INDEX "Channel_source_type_handle_key" ON "Channel"("source_type", "handle");

-- CreateIndex
CREATE INDEX "subscription_index_on_channel_id" ON "UserSubscription"("channel_id");

-- CreateIndex
CREATE INDEX "subscription_index_on_user_folder" ON "UserSubscription"("user_id", "folder_id");

-- CreateIndex
CREATE UNIQUE INDEX "UserSubscription_user_id_channel_id_key" ON "UserSubscription"("user_id", "channel_id");

-- CreateIndex
CREATE INDEX "video_index_on_channel_published_at" ON "Video"("channel_id", "published_at");

-- CreateIndex
CREATE INDEX "video_search_tsv_idx" ON "Video" USING GIN ("search_tsv");

-- CreateIndex
CREATE UNIQUE INDEX "Video_channel_id_source_id_key" ON "Video"("channel_id", "source_id");

-- CreateIndex
CREATE UNIQUE INDEX "Video_source_type_source_id_key" ON "Video"("source_type", "source_id");

-- CreateIndex
CREATE INDEX "user_video_consumption_index_on_video_id" ON "UserVideoConsumption"("video_id");

-- CreateIndex
CREATE UNIQUE INDEX "UserVideoConsumption_user_id_video_id_key" ON "UserVideoConsumption"("user_id", "video_id");

-- CreateIndex
CREATE INDEX "transcript_index_on_video_id" ON "Transcript"("video_id");

-- CreateIndex
CREATE INDEX "Article_transcript_id_style_language_idx" ON "Article"("transcript_id", "style", "language");

-- CreateIndex
CREATE INDEX "Summary_transcript_id_language_idx" ON "Summary"("transcript_id", "language");

-- CreateIndex
CREATE UNIQUE INDEX "Folder_user_id_name_key" ON "Folder"("user_id", "name");

-- CreateIndex
CREATE INDEX "video_star_index_on_video_id" ON "VideoStar"("video_id");

-- CreateIndex
CREATE UNIQUE INDEX "VideoStar_user_id_video_id_key" ON "VideoStar"("user_id", "video_id");

-- CreateIndex
CREATE INDEX "video_save_index_on_video_id" ON "VideoSave"("video_id");

-- CreateIndex
CREATE UNIQUE INDEX "VideoSave_user_id_video_id_key" ON "VideoSave"("user_id", "video_id");

-- CreateIndex
CREATE INDEX "video_archive_index_on_video_id" ON "VideoArchive"("video_id");

-- CreateIndex
CREATE UNIQUE INDEX "VideoArchive_user_id_video_id_key" ON "VideoArchive"("user_id", "video_id");

-- CreateIndex
CREATE INDEX "standalone_video_index_on_video_id" ON "StandaloneVideo"("video_id");

-- CreateIndex
CREATE UNIQUE INDEX "StandaloneVideo_user_id_video_id_key" ON "StandaloneVideo"("user_id", "video_id");

-- CreateIndex
CREATE UNIQUE INDEX "Playlist_user_id_name_key" ON "Playlist"("user_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Playlist_user_id_source_type_source_id_key" ON "Playlist"("user_id", "source_type", "source_id");

-- CreateIndex
CREATE INDEX "playlist_video_index_on_video_id" ON "PlaylistVideo"("video_id");

-- CreateIndex
CREATE UNIQUE INDEX "PlaylistVideo_playlist_id_video_id_key" ON "PlaylistVideo"("playlist_id", "video_id");

-- CreateIndex
CREATE INDEX "note_index_on_user_video" ON "Note"("user_id", "video_id");

-- CreateIndex
CREATE UNIQUE INDEX "VideoEmbedding_video_id_key" ON "VideoEmbedding"("video_id");

-- CreateIndex
CREATE INDEX "video_embedding_hnsw_idx" ON "VideoEmbedding"("embedding");

-- CreateIndex
CREATE INDEX "user_request_index_on_user_created" ON "UserRequest"("user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "user_request_index_on_user_type_created" ON "UserRequest"("user_id", "type", "created_at" DESC);

-- CreateIndex
CREATE INDEX "user_request_index_on_video" ON "UserRequest"("video_id");

-- AddForeignKey
ALTER TABLE "UserSubscription" ADD CONSTRAINT "UserSubscription_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "Channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserSubscription" ADD CONSTRAINT "UserSubscription_folder_id_fkey" FOREIGN KEY ("folder_id") REFERENCES "Folder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserSubscription" ADD CONSTRAINT "UserSubscription_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("source_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Video" ADD CONSTRAINT "Video_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "Channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserVideoConsumption" ADD CONSTRAINT "UserVideoConsumption_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("source_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserVideoConsumption" ADD CONSTRAINT "UserVideoConsumption_video_id_fkey" FOREIGN KEY ("video_id") REFERENCES "Video"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transcript" ADD CONSTRAINT "Transcript_video_id_fkey" FOREIGN KEY ("video_id") REFERENCES "Video"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Article" ADD CONSTRAINT "Article_transcript_id_fkey" FOREIGN KEY ("transcript_id") REFERENCES "Transcript"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Summary" ADD CONSTRAINT "Summary_transcript_id_fkey" FOREIGN KEY ("transcript_id") REFERENCES "Transcript"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Folder" ADD CONSTRAINT "Folder_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("source_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoStar" ADD CONSTRAINT "VideoStar_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("source_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoStar" ADD CONSTRAINT "VideoStar_video_id_fkey" FOREIGN KEY ("video_id") REFERENCES "Video"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoSave" ADD CONSTRAINT "VideoSave_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("source_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoSave" ADD CONSTRAINT "VideoSave_video_id_fkey" FOREIGN KEY ("video_id") REFERENCES "Video"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoArchive" ADD CONSTRAINT "VideoArchive_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("source_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoArchive" ADD CONSTRAINT "VideoArchive_video_id_fkey" FOREIGN KEY ("video_id") REFERENCES "Video"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StandaloneVideo" ADD CONSTRAINT "StandaloneVideo_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("source_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StandaloneVideo" ADD CONSTRAINT "StandaloneVideo_video_id_fkey" FOREIGN KEY ("video_id") REFERENCES "Video"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Playlist" ADD CONSTRAINT "Playlist_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("source_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlaylistVideo" ADD CONSTRAINT "PlaylistVideo_playlist_id_fkey" FOREIGN KEY ("playlist_id") REFERENCES "Playlist"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlaylistVideo" ADD CONSTRAINT "PlaylistVideo_video_id_fkey" FOREIGN KEY ("video_id") REFERENCES "Video"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Note" ADD CONSTRAINT "Note_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("source_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Note" ADD CONSTRAINT "Note_video_id_fkey" FOREIGN KEY ("video_id") REFERENCES "Video"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoEmbedding" ADD CONSTRAINT "VideoEmbedding_video_id_fkey" FOREIGN KEY ("video_id") REFERENCES "Video"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRequest" ADD CONSTRAINT "UserRequest_article_id_fkey" FOREIGN KEY ("article_id") REFERENCES "Article"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRequest" ADD CONSTRAINT "UserRequest_summary_id_fkey" FOREIGN KEY ("summary_id") REFERENCES "Summary"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRequest" ADD CONSTRAINT "UserRequest_transcript_id_fkey" FOREIGN KEY ("transcript_id") REFERENCES "Transcript"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRequest" ADD CONSTRAINT "UserRequest_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("source_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRequest" ADD CONSTRAINT "UserRequest_video_id_fkey" FOREIGN KEY ("video_id") REFERENCES "Video"("id") ON DELETE CASCADE ON UPDATE CASCADE;

