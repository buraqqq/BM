/*
  Warnings:

  - You are about to drop the `subcategories` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the column `subcategoryId` on the `campaigns` table. All the data in the column will be lost.
  - You are about to drop the column `subcategoryId` on the `products` table. All the data in the column will be lost.
  - Added the required column `updatedAt` to the `brands` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "subcategories_categoryId_idx";

-- DropIndex
DROP INDEX "subcategories_slug_key";

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "subcategories";
PRAGMA foreign_keys=on;

-- CreateTable
CREATE TABLE "product_attribute_definitions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "categoryId" TEXT,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'TEXT',
    "unit" TEXT,
    "optionsJson" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "product_attribute_definitions_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "product_attribute_values" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "productId" TEXT NOT NULL,
    "attributeDefinitionId" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    CONSTRAINT "product_attribute_values_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "product_attribute_values_attributeDefinitionId_fkey" FOREIGN KEY ("attributeDefinitionId") REFERENCES "product_attribute_definitions" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "import_jobs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fileName" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "totalRows" INTEGER NOT NULL DEFAULT 0,
    "successCount" INTEGER NOT NULL DEFAULT 0,
    "errorCount" INTEGER NOT NULL DEFAULT 0,
    "createdCount" INTEGER NOT NULL DEFAULT 0,
    "updatedCount" INTEGER NOT NULL DEFAULT 0,
    "columnMappingJson" TEXT,
    "errorsJson" TEXT,
    "createdByAdminId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" DATETIME,
    CONSTRAINT "import_jobs_createdByAdminId_fkey" FOREIGN KEY ("createdByAdminId") REFERENCES "admin_users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_brands" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "logoUrl" TEXT,
    "description" TEXT,
    "website" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "seoTitle" TEXT,
    "seoDescription" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_brands" ("id", "name", "slug") SELECT "id", "name", "slug" FROM "brands";
DROP TABLE "brands";
ALTER TABLE "new_brands" RENAME TO "brands";
CREATE UNIQUE INDEX "brands_slug_key" ON "brands"("slug");
CREATE TABLE "new_campaigns" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "discountType" TEXT NOT NULL,
    "discountValue" DECIMAL NOT NULL,
    "scope" TEXT NOT NULL,
    "categoryId" TEXT,
    "startDate" DATETIME NOT NULL,
    "endDate" DATETIME NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "bannerText" TEXT,
    "ctaText" TEXT,
    "ctaLink" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "campaigns_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_campaigns" ("bannerText", "categoryId", "createdAt", "ctaLink", "ctaText", "description", "discountType", "discountValue", "endDate", "id", "isActive", "name", "scope", "slug", "startDate", "updatedAt") SELECT "bannerText", "categoryId", "createdAt", "ctaLink", "ctaText", "description", "discountType", "discountValue", "endDate", "id", "isActive", "name", "scope", "slug", "startDate", "updatedAt" FROM "campaigns";
DROP TABLE "campaigns";
ALTER TABLE "new_campaigns" RENAME TO "campaigns";
CREATE UNIQUE INDEX "campaigns_slug_key" ON "campaigns"("slug");
CREATE INDEX "campaigns_startDate_endDate_idx" ON "campaigns"("startDate", "endDate");
CREATE TABLE "new_categories" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "shortDescription" TEXT,
    "description" TEXT,
    "imageUrl" TEXT,
    "icon" TEXT,
    "color" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isFeatured" BOOLEAN NOT NULL DEFAULT false,
    "seoTitle" TEXT,
    "seoDescription" TEXT,
    "parentId" TEXT,
    "path" TEXT NOT NULL DEFAULT '/',
    "depth" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "categories_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "categories" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_categories" ("color", "createdAt", "icon", "id", "isActive", "shortDescription", "slug", "sortOrder", "title", "updatedAt") SELECT "color", "createdAt", "icon", "id", "isActive", "shortDescription", "slug", "sortOrder", "title", "updatedAt" FROM "categories";
DROP TABLE "categories";
ALTER TABLE "new_categories" RENAME TO "categories";
CREATE UNIQUE INDEX "categories_slug_key" ON "categories"("slug");
CREATE INDEX "categories_parentId_idx" ON "categories"("parentId");
CREATE INDEX "categories_path_idx" ON "categories"("path");
CREATE TABLE "new_products" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sku" TEXT NOT NULL,
    "barcode" TEXT,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "brandId" TEXT,
    "shortDescription" TEXT,
    "description" TEXT,
    "price" DECIMAL NOT NULL,
    "compareAtPrice" DECIMAL,
    "salePrice" DECIMAL,
    "costPrice" DECIMAL,
    "taxRate" DECIMAL NOT NULL DEFAULT 20,
    "unit" TEXT NOT NULL DEFAULT 'ADET',
    "weight" REAL,
    "dimensionsJson" TEXT,
    "attributesJson" TEXT,
    "seoTitle" TEXT,
    "seoDescription" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isFeatured" BOOLEAN NOT NULL DEFAULT false,
    "legacySourceId" TEXT,
    "legacyCategoryLabel" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "products_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "products_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "brands" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_products" ("attributesJson", "barcode", "brandId", "categoryId", "compareAtPrice", "costPrice", "createdAt", "description", "dimensionsJson", "id", "isActive", "isFeatured", "legacyCategoryLabel", "legacySourceId", "name", "price", "salePrice", "seoDescription", "seoTitle", "shortDescription", "sku", "slug", "taxRate", "unit", "updatedAt", "weight") SELECT "attributesJson", "barcode", "brandId", "categoryId", "compareAtPrice", "costPrice", "createdAt", "description", "dimensionsJson", "id", "isActive", "isFeatured", "legacyCategoryLabel", "legacySourceId", "name", "price", "salePrice", "seoDescription", "seoTitle", "shortDescription", "sku", "slug", "taxRate", "unit", "updatedAt", "weight" FROM "products";
DROP TABLE "products";
ALTER TABLE "new_products" RENAME TO "products";
CREATE UNIQUE INDEX "products_sku_key" ON "products"("sku");
CREATE UNIQUE INDEX "products_barcode_key" ON "products"("barcode");
CREATE UNIQUE INDEX "products_slug_key" ON "products"("slug");
CREATE INDEX "products_categoryId_idx" ON "products"("categoryId");
CREATE INDEX "products_isActive_idx" ON "products"("isActive");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "product_attribute_definitions_categoryId_idx" ON "product_attribute_definitions"("categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "product_attribute_definitions_categoryId_key_key" ON "product_attribute_definitions"("categoryId", "key");

-- CreateIndex
CREATE INDEX "product_attribute_values_productId_idx" ON "product_attribute_values"("productId");

-- CreateIndex
CREATE INDEX "product_attribute_values_attributeDefinitionId_idx" ON "product_attribute_values"("attributeDefinitionId");

-- CreateIndex
CREATE UNIQUE INDEX "product_attribute_values_productId_attributeDefinitionId_key" ON "product_attribute_values"("productId", "attributeDefinitionId");

-- CreateIndex
CREATE INDEX "import_jobs_status_idx" ON "import_jobs"("status");
