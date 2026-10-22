-- CreateEnum
CREATE TYPE "EventSpinPrize" AS ENUM ('EVENT_CASHBACK_10', 'SITE_DISCOUNT_20', 'FREE_SHIPPING_3', 'WALLET_60K', 'WALLET_120K');

-- CreateTable
CREATE TABLE "EventSpin" (
    "id" UUID NOT NULL,
    "eventPaymentId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "prize" "EventSpinPrize" NOT NULL,
    "rewardCode" TEXT,
    "rewardAmount" DECIMAL(12,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventSpin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FreeShippingGrant" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "remainingUses" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FreeShippingGrant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EventSpin_eventPaymentId_key" ON "EventSpin"("eventPaymentId");

-- CreateIndex
CREATE INDEX "EventSpin_userId_idx" ON "EventSpin"("userId");

-- CreateIndex
CREATE INDEX "FreeShippingGrant_userId_idx" ON "FreeShippingGrant"("userId");

-- AddForeignKey
ALTER TABLE "EventSpin" ADD CONSTRAINT "EventSpin_eventPaymentId_fkey" FOREIGN KEY ("eventPaymentId") REFERENCES "EventPayment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventSpin" ADD CONSTRAINT "EventSpin_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FreeShippingGrant" ADD CONSTRAINT "FreeShippingGrant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

