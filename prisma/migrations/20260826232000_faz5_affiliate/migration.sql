-- CreateTable
CREATE TABLE "affiliate_products" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "vendor" TEXT NOT NULL,
    "affiliateUrl" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "estimatedPrice" DECIMAL,
    "imageUrl" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "affiliate_products_category_idx" ON "affiliate_products"("category");
