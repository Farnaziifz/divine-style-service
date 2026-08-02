CREATE TABLE IF NOT EXISTS "OrderNotificationPhone" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "phoneNumber" TEXT NOT NULL,
  "label" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "isDeleted" BOOLEAN NOT NULL DEFAULT false,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "OrderNotificationPhone_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "OrderNotificationPhone_phoneNumber_key" ON "OrderNotificationPhone"("phoneNumber");
