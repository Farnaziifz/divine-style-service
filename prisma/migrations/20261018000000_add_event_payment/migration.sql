-- CreateEnum
CREATE TYPE "EventPaymentStatus" AS ENUM ('INITIATED', 'PAID', 'FAILED');

-- CreateTable
CREATE TABLE "EventPayment" (
    "id" UUID NOT NULL,
    "eventId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "provider" "PaymentProvider" NOT NULL,
    "status" "EventPaymentStatus" NOT NULL DEFAULT 'INITIATED',
    "amount" DECIMAL(12,2) NOT NULL,
    "authority" TEXT,
    "refId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verifiedAt" TIMESTAMP(3),

    CONSTRAINT "EventPayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EventPayment_authority_key" ON "EventPayment"("authority");

-- CreateIndex
CREATE INDEX "EventPayment_eventId_idx" ON "EventPayment"("eventId");

-- CreateIndex
CREATE INDEX "EventPayment_userId_idx" ON "EventPayment"("userId");

-- CreateIndex
CREATE INDEX "EventPayment_status_idx" ON "EventPayment"("status");

-- AddForeignKey
ALTER TABLE "EventPayment" ADD CONSTRAINT "EventPayment_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventPayment" ADD CONSTRAINT "EventPayment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

