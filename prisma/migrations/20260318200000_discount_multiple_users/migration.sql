-- AlterEnum
ALTER TYPE "DiscountCodeScope" ADD VALUE 'MULTIPLE_USERS';

-- CreateTable
CREATE TABLE "DiscountCodeEligibleUser" (
    "id" UUID NOT NULL,
    "discountCodeId" UUID NOT NULL,
    "userId" UUID NOT NULL,

    CONSTRAINT "DiscountCodeEligibleUser_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DiscountCodeEligibleUser_discountCodeId_userId_key" ON "DiscountCodeEligibleUser"("discountCodeId", "userId");

-- CreateIndex
CREATE INDEX "DiscountCodeEligibleUser_userId_idx" ON "DiscountCodeEligibleUser"("userId");

-- AddForeignKey
ALTER TABLE "DiscountCodeEligibleUser" ADD CONSTRAINT "DiscountCodeEligibleUser_discountCodeId_fkey" FOREIGN KEY ("discountCodeId") REFERENCES "DiscountCode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscountCodeEligibleUser" ADD CONSTRAINT "DiscountCodeEligibleUser_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
