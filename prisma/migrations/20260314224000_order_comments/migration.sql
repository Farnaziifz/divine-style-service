-- CreateTable
CREATE TABLE "OrderComment" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "authorRole" "Role" NOT NULL,
    "authorUserId" UUID,
    "parentId" UUID,
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "OrderComment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OrderComment_orderId_idx" ON "OrderComment"("orderId");

-- CreateIndex
CREATE INDEX "OrderComment_authorUserId_idx" ON "OrderComment"("authorUserId");

-- CreateIndex
CREATE INDEX "OrderComment_parentId_idx" ON "OrderComment"("parentId");

-- AddForeignKey
ALTER TABLE "OrderComment" ADD CONSTRAINT "OrderComment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderComment" ADD CONSTRAINT "OrderComment_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderComment" ADD CONSTRAINT "OrderComment_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "OrderComment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

