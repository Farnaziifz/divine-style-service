-- AlterEnum
ALTER TYPE "PaymentProvider" ADD VALUE 'SNAPPPAY';

-- AlterTable
ALTER TABLE "PaymentTransaction" ADD COLUMN     "gatewayStatus" TEXT,
ADD COLUMN     "gatewayTransactionId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "PaymentTransaction_gatewayTransactionId_key" ON "PaymentTransaction"("gatewayTransactionId");

