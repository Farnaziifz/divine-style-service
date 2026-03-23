ALTER TABLE "Order"
ADD COLUMN IF NOT EXISTS "shippingMethodId" UUID,
ADD COLUMN IF NOT EXISTS "shippingMethodTitle" TEXT,
ADD COLUMN IF NOT EXISTS "shippingMethodPrice" INTEGER;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'Order_shippingMethodId_fkey'
  ) THEN
    ALTER TABLE "Order"
    ADD CONSTRAINT "Order_shippingMethodId_fkey"
    FOREIGN KEY ("shippingMethodId") REFERENCES "ShippingMethod"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "Order_shippingMethodId_idx" ON "Order"("shippingMethodId");

