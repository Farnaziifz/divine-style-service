-- AlterTable
ALTER TABLE "OfflineSale" ADD COLUMN     "customerId" UUID;

-- CreateIndex
CREATE INDEX "OfflineSale_customerId_idx" ON "OfflineSale"("customerId");

-- AddForeignKey
ALTER TABLE "OfflineSale" ADD CONSTRAINT "OfflineSale_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

