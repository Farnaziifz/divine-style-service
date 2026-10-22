-- AlterTable
ALTER TABLE "EventPayment" ADD COLUMN     "offlineSaleId" UUID;

-- CreateIndex
CREATE UNIQUE INDEX "EventPayment_offlineSaleId_key" ON "EventPayment"("offlineSaleId");

-- AddForeignKey
ALTER TABLE "EventPayment" ADD CONSTRAINT "EventPayment_offlineSaleId_fkey" FOREIGN KEY ("offlineSaleId") REFERENCES "OfflineSale"("id") ON DELETE SET NULL ON UPDATE CASCADE;

