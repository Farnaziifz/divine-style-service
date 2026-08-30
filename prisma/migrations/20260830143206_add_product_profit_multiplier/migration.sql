-- AlterTable: add column with a safe default first (no existing rows broken)
ALTER TABLE "Product" ADD COLUMN "profitMultiplier" DECIMAL(6,2) NOT NULL DEFAULT 1;

-- Backfill: every existing product inherits its current category's profitMultiplier,
-- so already-computed finalPrice/discountPrice values stay consistent with their
-- pricing basis until the next recalculation.
UPDATE "Product" p
SET "profitMultiplier" = c."profitMultiplier"
FROM "Category" c
WHERE p."categoryId" = c."id";
