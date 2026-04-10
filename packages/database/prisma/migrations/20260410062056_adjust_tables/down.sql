-- DropForeignKey
ALTER TABLE "UserSubscription"
DROP CONSTRAINT "UserSubscription_user_id_fkey";

-- DropForeignKey
ALTER TABLE "UserSubscription"
DROP CONSTRAINT "UserSubscription_channel_id_fkey";

-- DropTable
DROP TABLE "UserSubscription";

-- Drop unique index on Channel.source_id
DROP INDEX "Channel_source_id_key";

-- Restore Channel: drop source_type, add user_id
ALTER TABLE "Channel"
DROP COLUMN "source_type";

ALTER TABLE "Channel"
ADD COLUMN "user_id" TEXT NOT NULL DEFAULT '';

ALTER TABLE "Channel"
ALTER COLUMN "user_id"
DROP DEFAULT;

-- Recreate old Channel indexes
CREATE UNIQUE INDEX "Channel_user_id_source_id_key" ON "Channel" ("user_id", "source_id");

CREATE INDEX "channel_index_on_source_id" ON "Channel" ("source_id");

-- Remove source_type from User
ALTER TABLE "User"
DROP COLUMN "source_type";

-- Rename source_id back to user_id on User
ALTER TABLE "User"
RENAME COLUMN "source_id" TO "user_id";

-- Rename indexes back to ClerkUser names
ALTER INDEX "User_source_id_key"
RENAME TO "ClerkUser_user_id_key";

ALTER INDEX "User_email_key"
RENAME TO "ClerkUser_email_key";

ALTER INDEX "User_pkey"
RENAME TO "ClerkUser_pkey";

-- Rename User back to ClerkUser
ALTER TABLE "User"
RENAME TO "ClerkUser";

-- Recreate named index on ClerkUser.user_id
CREATE INDEX "clerk_user_index_on_user_id" ON "ClerkUser" ("user_id");

-- Recreate FK from Channel to ClerkUser
ALTER TABLE "Channel"
ADD CONSTRAINT "Channel_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "ClerkUser" ("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- DropEnum
DROP TYPE "UserSourceType";

-- DropEnum
DROP TYPE "VideoPlatformType";
