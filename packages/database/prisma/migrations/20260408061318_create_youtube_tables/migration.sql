-- CreateTable
CREATE TABLE "Channel" (
  "id" BIGSERIAL NOT NULL,
  "userId" TEXT NOT NULL,
  "channelId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "rssUrl" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Channel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Video" (
  "id" BIGSERIAL NOT NULL,
  "channelId" BIGINT NOT NULL,
  "videoId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "publishedAt" TIMESTAMP(3) NOT NULL,
  "readAt" TIMESTAMP(3),
  "transcriptText" TEXT,
  "transcriptFetchedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Video_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Channel_userId_idx" ON "Channel" ("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Channel_userId_channelId_key" ON "Channel" ("userId", "channelId");

-- CreateIndex
CREATE INDEX "Video_channelId_publishedAt_idx" ON "Video" ("channelId", "publishedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Video_channelId_videoId_key" ON "Video" ("channelId", "videoId");

-- AddForeignKey
ALTER TABLE "Video"
ADD CONSTRAINT "Video_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
