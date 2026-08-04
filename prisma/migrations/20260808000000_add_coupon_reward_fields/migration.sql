-- AlterEnum
ALTER TYPE "CreditLedgerReason" ADD VALUE 'COUPON';

-- AlterTable
ALTER TABLE "CouponDetail" ADD COLUMN     "rewardValue" DECIMAL(12,2) NOT NULL,
ADD COLUMN     "rewardValueType" "IncentiveValueType" NOT NULL;
