-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN "costPrice" DECIMAL(12,2);

-- Backfill: سفارش‌های قبلی با costPrice فعلی محصول (بهترین تخمین موجود؛ همان مقداری که گزارش‌ها تا الان استفاده می‌کردند)
UPDATE "OrderItem" oi
SET "costPrice" = p."costPrice"
FROM "Product" p
WHERE p.id = oi."productId" AND oi."costPrice" IS NULL;
