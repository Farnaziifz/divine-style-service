-- AlterTable
ALTER TABLE "Order" ADD COLUMN "orderCode" TEXT;

UPDATE "Order"
SET "orderCode" =
  'DV-' ||
  to_char("createdAt", 'YYYYMMDD') ||
  '-' ||
  substring(replace("id"::text, '-', '') from 1 for 8)
WHERE "orderCode" IS NULL;

-- AlterTable
ALTER TABLE "Order" ALTER COLUMN "orderCode" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Order_orderCode_key" ON "Order"("orderCode");

