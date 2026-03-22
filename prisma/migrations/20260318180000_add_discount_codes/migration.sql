-- CreateEnum
CREATE TYPE "DiscountCodeScope" AS ENUM ('ALL_USERS', 'SINGLE_USER', 'USER_GROUP');

-- CreateEnum
CREATE TYPE "DiscountValueType" AS ENUM ('PERCENT', 'FIXED_AMOUNT');

-- CreateTable
CREATE TABLE "DiscountCode" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT,
    "scope" "DiscountCodeScope" NOT NULL,
    "userId" UUID,
    "userGroupId" UUID,
    "valueType" "DiscountValueType" NOT NULL,
    "value" DECIMAL(12,2) NOT NULL,
    "minOrderAmount" DECIMAL(12,2),
    "validFrom" TIMESTAMP(3) NOT NULL,
    "validTo" TIMESTAMP(3) NOT NULL,
    "maxTotalUses" INTEGER,
    "usedCount" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "DiscountCode_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DiscountCode_code_key" ON "DiscountCode"("code");

-- CreateIndex
CREATE INDEX "DiscountCode_code_idx" ON "DiscountCode"("code");

-- CreateIndex
CREATE INDEX "DiscountCode_scope_idx" ON "DiscountCode"("scope");

-- CreateIndex
CREATE INDEX "DiscountCode_validFrom_validTo_idx" ON "DiscountCode"("validFrom", "validTo");

-- CreateIndex
CREATE INDEX "DiscountCode_userId_idx" ON "DiscountCode"("userId");

-- CreateIndex
CREATE INDEX "DiscountCode_userGroupId_idx" ON "DiscountCode"("userGroupId");

-- AddForeignKey
ALTER TABLE "DiscountCode" ADD CONSTRAINT "DiscountCode_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
