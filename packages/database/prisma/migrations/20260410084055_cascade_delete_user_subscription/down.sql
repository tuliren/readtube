-- DropForeignKey
ALTER TABLE "UserSubscription"
    DROP CONSTRAINT "UserSubscription_user_id_fkey";

-- AddForeignKey
ALTER TABLE "UserSubscription"
    ADD CONSTRAINT "UserSubscription_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User" ("source_id") ON DELETE RESTRICT ON UPDATE CASCADE;
