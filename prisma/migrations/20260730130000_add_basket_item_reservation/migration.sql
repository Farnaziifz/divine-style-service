-- Stock is reserved the moment an item is added to the basket; this column
-- tracks when that reservation expires so the background sweeper can
-- release it back to available stock.
ALTER TABLE "TempBasketItem" ADD COLUMN "reservedUntil" TIMESTAMP(3);
