-- Enforce "one folder per (user, name)" so users can't accidentally create
-- two folders with identical names in the sidebar. Matches the same
-- constraint the Tag model already has via @@unique([user_id, name]).
--
-- The composite unique index serves double duty as a per-user lookup
-- index (Postgres uses its leading column for any query scoped by
-- user_id), so the previously-standalone folder_index_on_user_id is
-- redundant and dropped in the same migration to avoid double-indexing
-- every write.

DROP INDEX IF EXISTS "folder_index_on_user_id";

CREATE UNIQUE INDEX "Folder_user_id_name_key" ON "Folder" ("user_id", "name");
