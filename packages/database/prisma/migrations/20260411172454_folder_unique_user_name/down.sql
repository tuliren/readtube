DROP INDEX IF EXISTS "Folder_user_id_name_key";

CREATE INDEX "folder_index_on_user_id" ON "Folder" ("user_id");
