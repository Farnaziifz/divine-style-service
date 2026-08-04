-- CreateEnum
CREATE TYPE "IncentiveType" AS ENUM ('DISCOUNT_CODE', 'CASHBACK', 'COUPON', 'CREDIT_GIFT', 'POINTS_BADGE');

-- CreateEnum
CREATE TYPE "IncentiveValueType" AS ENUM ('PERCENTAGE', 'FIXED_AMOUNT');

-- CreateEnum
CREATE TYPE "IncentiveTierType" AS ENUM ('FLAT', 'STEPPED');

-- CreateEnum
CREATE TYPE "IncentiveUsageType" AS ENUM ('SINGLE_USE', 'MULTI_USE');

-- CreateEnum
CREATE TYPE "CouponTriggerType" AS ENUM ('FIRST_PURCHASE', 'PURCHASE_ABOVE_AMOUNT', 'REFERRAL', 'CATEGORY_PURCHASE');

-- CreateEnum
CREATE TYPE "CreditLedgerReason" AS ENUM ('GIFT', 'USED', 'EXPIRED', 'ADJUSTMENT');

-- CreateTable
CREATE TABLE "CustomerSegment" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerSegment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SegmentMembership" (
    "id" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "segmentId" UUID NOT NULL,
    "recencyDays" INTEGER NOT NULL,
    "frequencyCount" INTEGER NOT NULL,
    "monetaryTotal" DECIMAL(12,2) NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SegmentMembership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Incentive" (
    "id" UUID NOT NULL,
    "type" "IncentiveType" NOT NULL,
    "title" TEXT NOT NULL,
    "targetSegmentId" UUID,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Incentive_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiscountCodeDetail" (
    "incentiveId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "valueType" "IncentiveValueType" NOT NULL,
    "value" DECIMAL(12,2) NOT NULL,
    "tierType" "IncentiveTierType" NOT NULL DEFAULT 'FLAT',
    "usageType" "IncentiveUsageType" NOT NULL DEFAULT 'SINGLE_USE',
    "minPurchaseAmount" DECIMAL(12,2),

    CONSTRAINT "DiscountCodeDetail_pkey" PRIMARY KEY ("incentiveId")
);

-- CreateTable
CREATE TABLE "CashbackDetail" (
    "incentiveId" UUID NOT NULL,
    "valueType" "IncentiveValueType" NOT NULL,
    "value" DECIMAL(12,2) NOT NULL,
    "expiresAfterDays" INTEGER,
    "minPurchaseAmount" DECIMAL(12,2),

    CONSTRAINT "CashbackDetail_pkey" PRIMARY KEY ("incentiveId")
);

-- CreateTable
CREATE TABLE "CouponDetail" (
    "incentiveId" UUID NOT NULL,
    "triggerType" "CouponTriggerType" NOT NULL,
    "triggerConfig" JSONB NOT NULL,
    "rewardDescription" TEXT NOT NULL,

    CONSTRAINT "CouponDetail_pkey" PRIMARY KEY ("incentiveId")
);

-- CreateTable
CREATE TABLE "CreditGiftDetail" (
    "incentiveId" UUID NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "expiresAfterDays" INTEGER,
    "minPurchaseAmount" DECIMAL(12,2),

    CONSTRAINT "CreditGiftDetail_pkey" PRIMARY KEY ("incentiveId")
);

-- CreateTable
CREATE TABLE "PointsBadgeDetail" (
    "incentiveId" UUID NOT NULL,
    "pointsAwarded" INTEGER NOT NULL,
    "badgeKey" TEXT,
    "badgeLabel" TEXT,

    CONSTRAINT "PointsBadgeDetail_pkey" PRIMARY KEY ("incentiveId")
);

-- CreateTable
CREATE TABLE "IncentiveRedemption" (
    "id" UUID NOT NULL,
    "incentiveId" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "orderId" UUID,
    "redeemedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "amountApplied" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "IncentiveRedemption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Wallet" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "balance" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Wallet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreditLedgerEntry" (
    "id" UUID NOT NULL,
    "walletId" UUID NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "reason" "CreditLedgerReason" NOT NULL,
    "incentiveRedemptionId" UUID,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreditLedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChurnEvaluationSnapshot" (
    "id" UUID NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "totalCustomers" INTEGER NOT NULL,
    "atRiskCount" INTEGER NOT NULL,
    "lostCount" INTEGER NOT NULL,
    "regularCount" INTEGER NOT NULL,
    "churnRatePercent" DECIMAL(5,2) NOT NULL,

    CONSTRAINT "ChurnEvaluationSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoyaltyEvaluationSnapshot" (
    "id" UUID NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "totalCustomers" INTEGER NOT NULL,
    "loyalCount" INTEGER NOT NULL,
    "promisingCount" INTEGER NOT NULL,
    "regularCount" INTEGER NOT NULL,
    "loyaltyRatePercent" DECIMAL(5,2) NOT NULL,

    CONSTRAINT "LoyaltyEvaluationSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CustomerSegment_key_key" ON "CustomerSegment"("key");

-- CreateIndex
CREATE INDEX "SegmentMembership_customerId_idx" ON "SegmentMembership"("customerId");

-- CreateIndex
CREATE INDEX "SegmentMembership_segmentId_idx" ON "SegmentMembership"("segmentId");

-- CreateIndex
CREATE INDEX "SegmentMembership_computedAt_idx" ON "SegmentMembership"("computedAt");

-- CreateIndex
CREATE INDEX "Incentive_type_idx" ON "Incentive"("type");

-- CreateIndex
CREATE INDEX "Incentive_targetSegmentId_idx" ON "Incentive"("targetSegmentId");

-- CreateIndex
CREATE INDEX "Incentive_isActive_startsAt_endsAt_idx" ON "Incentive"("isActive", "startsAt", "endsAt");

-- CreateIndex
CREATE UNIQUE INDEX "DiscountCodeDetail_code_key" ON "DiscountCodeDetail"("code");

-- CreateIndex
CREATE INDEX "IncentiveRedemption_incentiveId_idx" ON "IncentiveRedemption"("incentiveId");

-- CreateIndex
CREATE INDEX "IncentiveRedemption_customerId_idx" ON "IncentiveRedemption"("customerId");

-- CreateIndex
CREATE INDEX "IncentiveRedemption_orderId_idx" ON "IncentiveRedemption"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "Wallet_userId_key" ON "Wallet"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "CreditLedgerEntry_incentiveRedemptionId_key" ON "CreditLedgerEntry"("incentiveRedemptionId");

-- CreateIndex
CREATE INDEX "CreditLedgerEntry_walletId_idx" ON "CreditLedgerEntry"("walletId");

-- CreateIndex
CREATE INDEX "ChurnEvaluationSnapshot_computedAt_idx" ON "ChurnEvaluationSnapshot"("computedAt");

-- CreateIndex
CREATE INDEX "LoyaltyEvaluationSnapshot_computedAt_idx" ON "LoyaltyEvaluationSnapshot"("computedAt");

-- AddForeignKey
ALTER TABLE "SegmentMembership" ADD CONSTRAINT "SegmentMembership_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SegmentMembership" ADD CONSTRAINT "SegmentMembership_segmentId_fkey" FOREIGN KEY ("segmentId") REFERENCES "CustomerSegment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Incentive" ADD CONSTRAINT "Incentive_targetSegmentId_fkey" FOREIGN KEY ("targetSegmentId") REFERENCES "CustomerSegment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscountCodeDetail" ADD CONSTRAINT "DiscountCodeDetail_incentiveId_fkey" FOREIGN KEY ("incentiveId") REFERENCES "Incentive"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashbackDetail" ADD CONSTRAINT "CashbackDetail_incentiveId_fkey" FOREIGN KEY ("incentiveId") REFERENCES "Incentive"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CouponDetail" ADD CONSTRAINT "CouponDetail_incentiveId_fkey" FOREIGN KEY ("incentiveId") REFERENCES "Incentive"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditGiftDetail" ADD CONSTRAINT "CreditGiftDetail_incentiveId_fkey" FOREIGN KEY ("incentiveId") REFERENCES "Incentive"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PointsBadgeDetail" ADD CONSTRAINT "PointsBadgeDetail_incentiveId_fkey" FOREIGN KEY ("incentiveId") REFERENCES "Incentive"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncentiveRedemption" ADD CONSTRAINT "IncentiveRedemption_incentiveId_fkey" FOREIGN KEY ("incentiveId") REFERENCES "Incentive"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncentiveRedemption" ADD CONSTRAINT "IncentiveRedemption_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncentiveRedemption" ADD CONSTRAINT "IncentiveRedemption_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Wallet" ADD CONSTRAINT "Wallet_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditLedgerEntry" ADD CONSTRAINT "CreditLedgerEntry_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "Wallet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditLedgerEntry" ADD CONSTRAINT "CreditLedgerEntry_incentiveRedemptionId_fkey" FOREIGN KEY ("incentiveRedemptionId") REFERENCES "IncentiveRedemption"("id") ON DELETE SET NULL ON UPDATE CASCADE;
