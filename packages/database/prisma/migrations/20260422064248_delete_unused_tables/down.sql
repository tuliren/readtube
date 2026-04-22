-- CreateEnum
CREATE TYPE "HighlightSource" AS ENUM ('TRANSCRIPT', 'SUMMARY', 'ARTICLE');

-- CreateEnum
CREATE TYPE "VideoTagSource" AS ENUM ('MANUAL', 'AUTO_RULE', 'AUTO_AI');

-- CreateTable
CREATE TABLE "DigestRun"
(
    "id"           TEXT         NOT NULL,
    "user_id"      TEXT         NOT NULL,
    "sent_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "video_ids"    JSONB        NOT NULL,
    "email_status" TEXT         NOT NULL,
    "error"        TEXT,

    CONSTRAINT "DigestRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Highlight"
(
    "id"           TEXT              NOT NULL,
    "user_id"      TEXT              NOT NULL,
    "video_id"     TEXT              NOT NULL,
    "source"       "HighlightSource" NOT NULL,
    "anchor_start" INTEGER           NOT NULL,
    "anchor_end"   INTEGER           NOT NULL,
    "text"         TEXT              NOT NULL,
    "created_at"   TIMESTAMP(3)      NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Highlight_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Rule"
(
    "id"         TEXT         NOT NULL,
    "user_id"    TEXT         NOT NULL,
    "name"       TEXT         NOT NULL,
    "enabled"    BOOLEAN      NOT NULL DEFAULT true,
    "conditions" JSONB        NOT NULL,
    "actions"    JSONB        NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Rule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tag"
(
    "id"         TEXT         NOT NULL,
    "user_id"    TEXT         NOT NULL,
    "name"       TEXT         NOT NULL,
    "color"      TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Tag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserPreference"
(
    "id"              TEXT         NOT NULL,
    "user_id"         TEXT         NOT NULL,
    "theme"           TEXT         NOT NULL DEFAULT 'system',
    "density"         TEXT         NOT NULL DEFAULT 'comfortable',
    "digest_enabled"  BOOLEAN      NOT NULL DEFAULT false,
    "digest_hour_utc" INTEGER      NOT NULL DEFAULT 13,
    "created_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"      TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserPreference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VideoTag"
(
    "id"         TEXT             NOT NULL,
    "user_id"    TEXT             NOT NULL,
    "video_id"   TEXT             NOT NULL,
    "tag_id"     TEXT             NOT NULL,
    "source"     "VideoTagSource" NOT NULL DEFAULT 'MANUAL',
    "created_at" TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VideoTag_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "digest_run_index_on_user_sent_at" ON "DigestRun" ("user_id" ASC, "sent_at" ASC);

-- CreateIndex
CREATE INDEX "highlight_index_on_user_video" ON "Highlight" ("user_id" ASC, "video_id" ASC);

-- CreateIndex
CREATE INDEX "rule_index_on_user_id" ON "Rule" ("user_id" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "Tag_user_id_name_key" ON "Tag" ("user_id" ASC, "name" ASC);

-- CreateIndex
CREATE INDEX "tag_index_on_user_id" ON "Tag" ("user_id" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "UserPreference_user_id_key" ON "UserPreference" ("user_id" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "VideoTag_user_id_video_id_tag_id_key" ON "VideoTag" ("user_id" ASC, "video_id" ASC, "tag_id" ASC);

-- CreateIndex
CREATE INDEX "video_tag_index_on_tag_id" ON "VideoTag" ("tag_id" ASC);

-- CreateIndex
CREATE INDEX "video_tag_index_on_video_id" ON "VideoTag" ("video_id" ASC);

-- AddForeignKey
ALTER TABLE "DigestRun"
    ADD CONSTRAINT "DigestRun_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User" ("source_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Highlight"
    ADD CONSTRAINT "Highlight_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User" ("source_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Highlight"
    ADD CONSTRAINT "Highlight_video_id_fkey" FOREIGN KEY ("video_id") REFERENCES "Video" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rule"
    ADD CONSTRAINT "Rule_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User" ("source_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tag"
    ADD CONSTRAINT "Tag_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User" ("source_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserPreference"
    ADD CONSTRAINT "UserPreference_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User" ("source_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoTag"
    ADD CONSTRAINT "VideoTag_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "Tag" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoTag"
    ADD CONSTRAINT "VideoTag_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User" ("source_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoTag"
    ADD CONSTRAINT "VideoTag_video_id_fkey" FOREIGN KEY ("video_id") REFERENCES "Video" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
