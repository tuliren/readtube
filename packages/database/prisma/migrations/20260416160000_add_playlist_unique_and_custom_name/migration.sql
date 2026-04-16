-- Add DB-level uniqueness on (user_id, source_type, source_id) so two
-- Playlist rows for the same user can't share the same YouTube source
-- id even under a race in addPlaylistForUser's findFirst + create path.
CREATE UNIQUE INDEX "Playlist_user_id_source_type_source_id_key"
  ON "Playlist"("user_id", "source_type", "source_id");

-- Optional user-supplied override of the source-provided playlist
-- name. When set, the UI shows this as the primary label.
ALTER TABLE "Playlist" ADD COLUMN "custom_name" TEXT;
