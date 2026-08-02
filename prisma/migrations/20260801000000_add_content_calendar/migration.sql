-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "contentPostedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "ContentCalendarEntry" (
    "id" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "date" DATE NOT NULL,
    "postCount" INTEGER NOT NULL DEFAULT 1,
    "storyCount" INTEGER NOT NULL DEFAULT 5,
    "isDone" BOOLEAN NOT NULL DEFAULT false,
    "doneAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "ContentCalendarEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ContentCalendarEntry_date_idx" ON "ContentCalendarEntry"("date");

-- CreateIndex
CREATE UNIQUE INDEX "ContentCalendarEntry_productId_date_key" ON "ContentCalendarEntry"("productId", "date");

-- AddForeignKey
ALTER TABLE "ContentCalendarEntry" ADD CONSTRAINT "ContentCalendarEntry_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
