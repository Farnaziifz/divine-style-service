-- AlterTable
ALTER TABLE "Order"
ADD COLUMN     "discountCode" TEXT,
ADD COLUMN     "discountAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN     "shippingCost" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN     "payableAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN     "shippingAddress" JSONB;

