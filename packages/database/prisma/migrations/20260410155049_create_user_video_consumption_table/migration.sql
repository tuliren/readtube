-- AlterTable
ALTER TABLE "Video"
    DROP COLUMN "read_at";

-- CreateTable
CREATE TABLE "UserVideoConsumption"
(
    "id"       TEXT         NOT NULL,
    "user_id"  TEXT         NOT NULL,
    "video_id" TEXT         NOT NULL,
    "read_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserVideoConsumption_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "user_video_consumption_index_on_video_id" ON "UserVideoConsumption" ("video_id");

-- CreateIndex
CREATE UNIQUE INDEX "UserVideoConsumption_user_id_video_id_key" ON "UserVideoConsumption" ("user_id", "video_id");

-- AddForeignKey
ALTER TABLE "UserVideoConsumption"
    ADD CONSTRAINT "UserVideoConsumption_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User" ("source_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserVideoConsumption"
    ADD CONSTRAINT "UserVideoConsumption_video_id_fkey" FOREIGN KEY ("video_id") REFERENCES "Video" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
