-- AlterEnum
ALTER TYPE "IncentiveTierType" ADD VALUE 'USAGE_STEPPED';

-- AlterTable
ALTER TABLE "DiscountCodeTier" ALTER COLUMN "minAmount" DROP NOT NULL;
ALTER TABLE "DiscountCodeTier" ADD COLUMN "usageIndex" INTEGER;
