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
    "name" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

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

-- CreateIndex
CREATE INDEX "standalone_video_index_on_video_id" ON "StandaloneVideo"("video_id");

-- CreateIndex
CREATE UNIQUE INDEX "StandaloneVideo_user_id_video_id_key" ON "StandaloneVideo"("user_id", "video_id");

-- CreateIndex
CREATE UNIQUE INDEX "Playlist_user_id_name_key" ON "Playlist"("user_id", "name");

-- CreateIndex
CREATE INDEX "playlist_video_index_on_video_id" ON "PlaylistVideo"("video_id");

-- CreateIndex
CREATE UNIQUE INDEX "PlaylistVideo_playlist_id_video_id_key" ON "PlaylistVideo"("playlist_id", "video_id");

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
