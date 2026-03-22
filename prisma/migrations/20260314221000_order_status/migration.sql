-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM (
  'PENDING_PAYMENT',
  'PAID',
  'CONFIRMED',
  'SHIPPED',
  'DELIVERED',
  'CANCELED'
);

-- AlterTable
ALTER TABLE "Order"
ADD COLUMN     "orderStatus" "OrderStatus" NOT NULL DEFAULT 'PENDING_PAYMENT';

UPDATE "Order"
SET "orderStatus" = 'PAID'
WHERE "paymentStatus" = 'PAID';

