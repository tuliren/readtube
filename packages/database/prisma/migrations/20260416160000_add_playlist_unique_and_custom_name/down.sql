-- AlterTable
ALTER TABLE "Playlist" DROP COLUMN "custom_name";

-- DropIndex
DROP INDEX "Playlist_user_id_source_type_source_id_key";
