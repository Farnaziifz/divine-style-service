-- CreateTable
CREATE TABLE "DiscountCodeTier" (
    "id" UUID NOT NULL,
    "discountCodeDetailId" UUID NOT NULL,
    "minAmount" DECIMAL(12,2) NOT NULL,
    "value" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "DiscountCodeTier_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DiscountCodeTier_discountCodeDetailId_idx" ON "DiscountCodeTier"("discountCodeDetailId");

-- AddForeignKey
ALTER TABLE "DiscountCodeTier" ADD CONSTRAINT "DiscountCodeTier_discountCodeDetailId_fkey" FOREIGN KEY ("discountCodeDetailId") REFERENCES "DiscountCodeDetail"("incentiveId") ON DELETE CASCADE ON UPDATE CASCADE;
