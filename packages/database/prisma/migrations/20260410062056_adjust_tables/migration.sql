-- CreateEnum
CREATE TYPE "UserSourceType" AS ENUM('CLERK');

-- CreateEnum
CREATE TYPE "VideoPlatformType" AS ENUM('YOUTUBE');

-- Rename ClerkUser table to User
ALTER TABLE "ClerkUser"
RENAME TO "User";

-- Rename indexes to match new table name
ALTER INDEX "ClerkUser_pkey"
RENAME TO "User_pkey";

ALTER INDEX "ClerkUser_user_id_key"
RENAME TO "User_source_id_key";

ALTER INDEX "ClerkUser_email_key"
RENAME TO "User_email_key";

DROP INDEX "clerk_user_index_on_user_id";

-- Rename user_id column to source_id on User
ALTER TABLE "User"
RENAME COLUMN "user_id" TO "source_id";

-- Add source_type to User
ALTER TABLE "User"
ADD COLUMN "source_type" "UserSourceType" NOT NULL DEFAULT 'CLERK';

-- Drop FK from Channel before modifying the referenced column
ALTER TABLE "Channel"
DROP CONSTRAINT "Channel_user_id_fkey";

-- Drop old indexes on Channel
DROP INDEX "Channel_user_id_source_id_key";

DROP INDEX "channel_index_on_source_id";

-- Remove user_id from Channel, add source_type
ALTER TABLE "Channel"
DROP COLUMN "user_id",
ADD COLUMN "source_type" "VideoPlatformType" NOT NULL DEFAULT 'YOUTUBE';

-- Add unique index on Channel.source_id
CREATE UNIQUE INDEX "Channel_source_id_key" ON "Channel" ("source_id");

-- CreateTable UserSubscription
CREATE TABLE "UserSubscription" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "channel_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UserSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserSubscription_user_id_channel_id_key" ON "UserSubscription" ("user_id", "channel_id");

-- CreateIndex
CREATE INDEX "subscription_index_on_channel_id" ON "UserSubscription" ("channel_id");

-- AddForeignKey
ALTER TABLE "UserSubscription"
ADD CONSTRAINT "UserSubscription_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User" ("source_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserSubscription"
ADD CONSTRAINT "UserSubscription_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "Channel" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
