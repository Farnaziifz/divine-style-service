-- CreateTable
CREATE TABLE "SiteTestimonial" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "authorName" TEXT NOT NULL,
    "comment" TEXT NOT NULL,
    "rating" INTEGER,
    "isApproved" BOOLEAN NOT NULL DEFAULT false,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "SiteTestimonial_pkey" PRIMARY KEY ("id")
);
