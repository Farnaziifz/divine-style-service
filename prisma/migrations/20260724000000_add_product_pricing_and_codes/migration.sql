-- Category: کدگذاری و ضریب سود
ALTER TABLE "Category" ADD COLUMN "codeStart" INTEGER;
ALTER TABLE "Category" ADD COLUMN "nextCode" INTEGER;
ALTER TABLE "Category" ADD COLUMN "profitMultiplier" DECIMAL(6,2) NOT NULL DEFAULT 1;

-- backfill: به هر دسته‌بندی موجود یک بازهٔ کد ۱۰۰تایی جدا بده (بر اساس ترتیب ایجاد)
WITH ordered AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY "createdAt") AS rn
  FROM "Category"
)
UPDATE "Category" c
SET "codeStart" = 100 + (ordered.rn - 1) * 100,
    "nextCode" = 100 + (ordered.rn - 1) * 100
FROM ordered
WHERE c.id = ordered.id;

ALTER TABLE "Category" ALTER COLUMN "codeStart" SET NOT NULL;
ALTER TABLE "Category" ALTER COLUMN "nextCode" SET NOT NULL;

-- Product: کد محصول و قیمت‌گذاری سطح محصول
ALTER TABLE "Product" ADD COLUMN "code" INTEGER;
ALTER TABLE "Product" ADD COLUMN "costPrice" DECIMAL(12,2);
ALTER TABLE "Product" ADD COLUMN "finalPrice" DECIMAL(12,2);
ALTER TABLE "Product" ADD COLUMN "discountPrice" DECIMAL(12,2);
ALTER TABLE "Product" ADD COLUMN "discountPercent" INTEGER;

-- backfill: کد هر محصول موجود از بازهٔ کد دسته‌بندی‌اش، بر اساس ترتیب ایجاد
WITH ranked AS (
  SELECT p.id, c."codeStart",
         ROW_NUMBER() OVER (PARTITION BY p."categoryId" ORDER BY p."createdAt") AS rn
  FROM "Product" p
  JOIN "Category" c ON c.id = p."categoryId"
)
UPDATE "Product" p
SET "code" = ranked."codeStart" + ranked.rn - 1
FROM ranked
WHERE p.id = ranked.id;

-- شمارندهٔ nextCode هر دسته‌بندی را بعد از کدهای تخصیص‌یافته جلو ببر
UPDATE "Category" c
SET "nextCode" = sub.maxcode + 1
FROM (
  SELECT p."categoryId", MAX(p."code") AS maxcode
  FROM "Product" p
  GROUP BY p."categoryId"
) sub
WHERE c.id = sub."categoryId";

-- fallback: اگر محصولی به هر دلیلی کد نگرفت (دستهٔ نامعتبر و…)، کد یکتای اضطراری بده
WITH missing AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY "createdAt") AS rn
  FROM "Product" WHERE "code" IS NULL
)
UPDATE "Product" p SET "code" = 900000 + missing.rn - 1
FROM missing
WHERE p.id = missing.id;

-- backfill قیمت: از اولین واریانت هر محصول (بر اساس createdAt) بهای خالص/نهایی و تخفیف دستی را کپی کن
WITH first_variant AS (
  SELECT DISTINCT ON (v."productId") v."productId", v.price, v."discountPrice", v."discountPercent"
  FROM "ProductVariant" v
  ORDER BY v."productId", v."createdAt"
)
UPDATE "Product" p
SET "costPrice" = COALESCE(fv.price, 0),
    "finalPrice" = COALESCE(fv.price, 0),
    "discountPrice" = fv."discountPrice",
    "discountPercent" = fv."discountPercent"
FROM first_variant fv
WHERE p.id = fv."productId";

-- محصولات بدون هیچ واریانتی: صفر
UPDATE "Product" SET "costPrice" = 0, "finalPrice" = 0 WHERE "costPrice" IS NULL;

ALTER TABLE "Product" ALTER COLUMN "code" SET NOT NULL;
ALTER TABLE "Product" ALTER COLUMN "costPrice" SET NOT NULL;
ALTER TABLE "Product" ALTER COLUMN "finalPrice" SET NOT NULL;
ALTER TABLE "Product" ADD CONSTRAINT "Product_code_key" UNIQUE ("code");

-- قیمت دیگر سطح واریانت نیست
ALTER TABLE "ProductVariant" DROP COLUMN "price";
ALTER TABLE "ProductVariant" DROP COLUMN "discountPrice";
ALTER TABLE "ProductVariant" DROP COLUMN "discountPercent";
