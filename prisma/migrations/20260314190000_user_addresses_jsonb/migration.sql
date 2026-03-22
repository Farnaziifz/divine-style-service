-- AlterTable
ALTER TABLE "User" ADD COLUMN     "addresses" JSONB;

UPDATE "User"
SET "addresses" =
  CASE
    WHEN COALESCE("province", "city", "address", "plaque", "unit", "postalCode") IS NULL THEN "addresses"
    ELSE jsonb_build_array(
      jsonb_build_object(
        'id', concat('addr-', "id"),
        'province', "province",
        'city', "city",
        'address', "address",
        'plaque', "plaque",
        'unit', "unit",
        'postalCode', "postalCode",
        'isDefault', true
      )
    )
  END;

-- AlterTable
ALTER TABLE "User" DROP COLUMN "province",
DROP COLUMN "city",
DROP COLUMN "address",
DROP COLUMN "plaque",
DROP COLUMN "unit",
DROP COLUMN "postalCode";
