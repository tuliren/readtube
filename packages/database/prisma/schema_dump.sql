-- CreateEnum
CREATE TYPE "UserSourceType" AS ENUM('CLERK');

-- CreateEnum
CREATE TYPE "VideoPlatformType" AS ENUM('YOUTUBE');

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
  CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Channel" (
  "id" TEXT NOT NULL,
  "source_type" "VideoPlatformType" NOT NULL DEFAULT 'YOUTUBE',
  "source_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "rss_url" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Channel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserSubscription" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "channel_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UserSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Video" (
  "id" TEXT NOT NULL,
  "channel_id" TEXT NOT NULL,
  "source_id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "published_at" TIMESTAMP(3) NOT NULL,
  "read_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Video_pkey" PRIMARY KEY ("id")
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

-- CreateIndex
CREATE UNIQUE INDEX "User_source_id_key" ON "User" ("source_id");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User" ("email");

-- CreateIndex
CREATE UNIQUE INDEX "Channel_source_id_key" ON "Channel" ("source_id");

-- CreateIndex
CREATE INDEX "subscription_index_on_channel_id" ON "UserSubscription" ("channel_id");

-- CreateIndex
CREATE UNIQUE INDEX "UserSubscription_user_id_channel_id_key" ON "UserSubscription" ("user_id", "channel_id");

-- CreateIndex
CREATE INDEX "video_index_on_channel_published_at" ON "Video" ("channel_id", "published_at");

-- CreateIndex
CREATE INDEX "video_index_on_source_id" ON "Video" ("source_id");

-- CreateIndex
CREATE UNIQUE INDEX "Video_channel_id_source_id_key" ON "Video" ("channel_id", "source_id");

-- CreateIndex
CREATE INDEX "transcript_index_on_video_id" ON "Transcript" ("video_id");

-- AddForeignKey
ALTER TABLE "UserSubscription"
ADD CONSTRAINT "UserSubscription_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "Channel" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserSubscription"
ADD CONSTRAINT "UserSubscription_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User" ("source_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Video"
ADD CONSTRAINT "Video_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "Channel" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transcript"
ADD CONSTRAINT "Transcript_video_id_fkey" FOREIGN KEY ("video_id") REFERENCES "Video" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
