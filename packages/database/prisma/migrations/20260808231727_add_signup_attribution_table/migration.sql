-- First-touch marketing attribution captured when a user signs up: UTM
-- params, the external referrer, and the landing page of the first
-- visit. One row per user (unique user_id), written once shortly after
-- signup. The DROP INDEX on video_search_tsv_idx / video_embedding_hnsw_idx
-- and the DROP DEFAULT on Video.search_tsv that Prisma's diff emitted
-- have been removed by hand — those are managed by raw-SQL migrations
-- and Prisma's diff doesn't understand them.

-- CreateTable
CREATE TABLE "SignupAttribution" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "utm_source" TEXT,
    "utm_medium" TEXT,
    "utm_campaign" TEXT,
    "utm_term" TEXT,
    "utm_content" TEXT,
    "referrer" TEXT,
    "landing_page" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SignupAttribution_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SignupAttribution_user_id_key" ON "SignupAttribution"("user_id");

-- CreateIndex
CREATE INDEX "signup_attribution_index_on_utm_source" ON "SignupAttribution"("utm_source");

-- AddForeignKey
ALTER TABLE "SignupAttribution" ADD CONSTRAINT "SignupAttribution_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("source_id") ON DELETE CASCADE ON UPDATE CASCADE;
