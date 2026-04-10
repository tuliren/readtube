-- DropForeignKey
ALTER TABLE "UserSubscription"
DROP CONSTRAINT "UserSubscription_user_id_fkey";

-- DropForeignKey
ALTER TABLE "UserSubscription"
DROP CONSTRAINT "UserSubscription_channel_id_fkey";

-- DropForeignKey
ALTER TABLE "Video"
DROP CONSTRAINT "Video_channel_id_fkey";

-- DropForeignKey
ALTER TABLE "Transcript"
DROP CONSTRAINT "Transcript_video_id_fkey";

-- DropTable
DROP TABLE "Channel";

-- DropTable
DROP TABLE "UserSubscription";

-- DropTable
DROP TABLE "Video";

-- DropTable
DROP TABLE "Transcript";

-- Remove source_type from User
ALTER TABLE "User"
DROP COLUMN "source_type";

-- Rename source_id back to user_id
ALTER TABLE "User"
RENAME COLUMN "source_id" TO "user_id";

-- Convert id from TEXT back to BIGINT (cuid values are not numeric — data loss expected on rollback)
ALTER TABLE "User"
ALTER COLUMN "id"
SET DATA TYPE BIGINT USING 0;

CREATE SEQUENCE "ClerkUser_id_seq" OWNED BY "User"."id";

ALTER TABLE "User"
ALTER COLUMN "id"
SET DEFAULT nextval('"ClerkUser_id_seq"');

-- Rename indexes back to ClerkUser names
ALTER INDEX "User_source_id_key"
RENAME TO "ClerkUser_user_id_key";

ALTER INDEX "User_email_key"
RENAME TO "ClerkUser_email_key";

ALTER INDEX "User_pkey"
RENAME TO "ClerkUser_pkey";

-- Recreate named index on user_id
CREATE INDEX "clerk_user_index_on_user_id" ON "User" ("user_id");

-- Rename User back to ClerkUser
ALTER TABLE "User"
RENAME TO "ClerkUser";

-- DropEnum
DROP TYPE "UserSourceType";

-- DropEnum
DROP TYPE "VideoPlatformType";
