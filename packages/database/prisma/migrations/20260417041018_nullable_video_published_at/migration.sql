-- Drop the NOT NULL constraint on Video.published_at. YouTube watch-page
-- scrapes can legitimately fail to return a publish date (consent wall,
-- serverless egress quirks), and we'd rather store null than a synthetic
-- `new Date()` placeholder that can never be corrected. A later scrape
-- that does return a real date is free to backfill the null.
ALTER TABLE "Video" ALTER COLUMN "published_at" DROP NOT NULL;
