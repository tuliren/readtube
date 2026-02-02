CREATE TABLE "ClerkUser" (
  "id" BIGSERIAL NOT NULL,
  "user_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "image" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ClerkUser_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ClerkUser_user_id_key" ON "ClerkUser" ("user_id");

CREATE UNIQUE INDEX "ClerkUser_email_key" ON "ClerkUser" ("email");

CREATE INDEX "clerk_user_index_on_user_id" ON "ClerkUser" ("user_id");
