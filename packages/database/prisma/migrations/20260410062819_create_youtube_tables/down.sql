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
DROP TABLE "User";

-- DropTable
DROP TABLE "Channel";

-- DropTable
DROP TABLE "UserSubscription";

-- DropTable
DROP TABLE "Video";

-- DropTable
DROP TABLE "Transcript";

-- DropEnum
DROP TYPE "UserSourceType";

-- DropEnum
DROP TYPE "VideoPlatformType";

-- CreateTable
CREATE TABLE "ClerkUser"
(
    "user_id"    TEXT         NOT NULL,
    "name"       TEXT         NOT NULL,
    "email"      TEXT         NOT NULL,
    "image"      TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "id"         BIGSERIAL    NOT NULL,
    CONSTRAINT "ClerkUser_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ClerkUser_email_key" ON "ClerkUser" ("email" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "ClerkUser_user_id_key" ON "ClerkUser" ("user_id" ASC);

-- CreateIndex
CREATE INDEX "clerk_user_index_on_user_id" ON "ClerkUser" ("user_id" ASC);
