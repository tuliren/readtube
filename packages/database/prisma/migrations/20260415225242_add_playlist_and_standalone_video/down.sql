-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "plpgsql" WITH SCHEMA "pg_catalog" VERSION "1.0";

-- DropForeignKey
ALTER TABLE "StandaloneVideo" DROP CONSTRAINT "StandaloneVideo_user_id_fkey";

-- DropForeignKey
ALTER TABLE "StandaloneVideo" DROP CONSTRAINT "StandaloneVideo_video_id_fkey";

-- DropForeignKey
ALTER TABLE "Playlist" DROP CONSTRAINT "Playlist_user_id_fkey";

-- DropForeignKey
ALTER TABLE "PlaylistVideo" DROP CONSTRAINT "PlaylistVideo_playlist_id_fkey";

-- DropForeignKey
ALTER TABLE "PlaylistVideo" DROP CONSTRAINT "PlaylistVideo_video_id_fkey";

-- DropTable
DROP TABLE "StandaloneVideo";

-- DropTable
DROP TABLE "Playlist";

-- DropTable
DROP TABLE "PlaylistVideo";
