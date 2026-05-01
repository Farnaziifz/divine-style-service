CREATE INDEX IF NOT EXISTS "Order_paidAt_idx" ON "Order" ("paidAt");
CREATE INDEX IF NOT EXISTS "Order_paymentStatus_paidAt_idx" ON "Order" ("paymentStatus", "paidAt");
CREATE INDEX IF NOT EXISTS "Order_orderStatus_paidAt_idx" ON "Order" ("orderStatus", "paidAt");
CREATE INDEX IF NOT EXISTS "Order_createdAt_idx" ON "Order" ("createdAt");
