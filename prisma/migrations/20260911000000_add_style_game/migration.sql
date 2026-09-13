-- CreateEnum
CREATE TYPE "StyleGameStatus" AS ENUM ('AWAITING_ATTEMPT_1', 'AWAITING_ATTEMPT_2', 'COMPLETED');

-- CreateTable
CREATE TABLE "StyleGameSession" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "eventId" UUID,
    "photoUrl" TEXT NOT NULL,
    "status" "StyleGameStatus" NOT NULL DEFAULT 'AWAITING_ATTEMPT_1',
    "attempt1ProductId" UUID,
    "attempt1ImageUrl" TEXT,
    "attempt1Score" INTEGER,
    "suggestedProductIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "attempt2ProductId" UUID,
    "attempt2ImageUrl" TEXT,
    "attempt2Score" INTEGER,
    "passed" BOOLEAN,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StyleGameSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StyleGameSession_userId_idx" ON "StyleGameSession"("userId");

-- AddForeignKey
ALTER TABLE "StyleGameSession" ADD CONSTRAINT "StyleGameSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StyleGameSession" ADD CONSTRAINT "StyleGameSession_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

