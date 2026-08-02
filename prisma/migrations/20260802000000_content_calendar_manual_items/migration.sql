-- Clear existing demo rows: old shape (1 row = 1 product, no type/title) is
-- incompatible with the new shape, and "type" below is added as NOT NULL
-- with no default, which requires the table to be empty first.
DELETE FROM "ContentCalendarEntry";

-- CreateEnum
CREATE TYPE "ContentEntryType" AS ENUM ('POST', 'STORY');

-- DropForeignKey
ALTER TABLE "ContentCalendarEntry" DROP CONSTRAINT "ContentCalendarEntry_productId_fkey";

-- DropIndex
DROP INDEX "ContentCalendarEntry_productId_date_key";

-- AlterTable
ALTER TABLE "ContentCalendarEntry" DROP COLUMN "postCount",
DROP COLUMN "productId",
DROP COLUMN "storyCount",
ADD COLUMN     "title" TEXT,
ADD COLUMN     "type" "ContentEntryType" NOT NULL;

-- CreateTable
CREATE TABLE "_ContentCalendarEntryToProduct" (
    "A" UUID NOT NULL,
    "B" UUID NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "_ContentCalendarEntryToProduct_AB_unique" ON "_ContentCalendarEntryToProduct"("A", "B");

-- CreateIndex
CREATE INDEX "_ContentCalendarEntryToProduct_B_index" ON "_ContentCalendarEntryToProduct"("B");

-- AddForeignKey
ALTER TABLE "_ContentCalendarEntryToProduct" ADD CONSTRAINT "_ContentCalendarEntryToProduct_A_fkey" FOREIGN KEY ("A") REFERENCES "ContentCalendarEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ContentCalendarEntryToProduct" ADD CONSTRAINT "_ContentCalendarEntryToProduct_B_fkey" FOREIGN KEY ("B") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
