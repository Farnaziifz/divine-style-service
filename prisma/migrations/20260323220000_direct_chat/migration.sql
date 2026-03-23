CREATE TABLE IF NOT EXISTS "DirectConversation" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "userId" UUID NOT NULL,
  "userLastReadAt" TIMESTAMP(3),
  "adminLastReadAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "isDeleted" BOOLEAN NOT NULL DEFAULT false,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "DirectConversation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "DirectConversation_userId_key" ON "DirectConversation"("userId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'DirectConversation_userId_fkey'
  ) THEN
    ALTER TABLE "DirectConversation"
    ADD CONSTRAINT "DirectConversation_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'DirectAttachmentType'
  ) THEN
    CREATE TYPE "DirectAttachmentType" AS ENUM ('IMAGE', 'AUDIO');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "DirectMessage" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "conversationId" UUID NOT NULL,
  "authorRole" "Role" NOT NULL,
  "authorUserId" UUID,
  "text" TEXT,
  "attachmentType" "DirectAttachmentType",
  "attachmentUrl" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "isDeleted" BOOLEAN NOT NULL DEFAULT false,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "DirectMessage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "DirectMessage_conversationId_createdAt_idx" ON "DirectMessage"("conversationId","createdAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'DirectMessage_conversationId_fkey'
  ) THEN
    ALTER TABLE "DirectMessage"
    ADD CONSTRAINT "DirectMessage_conversationId_fkey"
    FOREIGN KEY ("conversationId") REFERENCES "DirectConversation"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'DirectMessage_authorUserId_fkey'
  ) THEN
    ALTER TABLE "DirectMessage"
    ADD CONSTRAINT "DirectMessage_authorUserId_fkey"
    FOREIGN KEY ("authorUserId") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

