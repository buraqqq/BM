/*
  Warnings:

  - You are about to drop the column `label` on the `addresses` table. All the data in the column will be lost.
  - You are about to drop the column `line1` on the `addresses` table. All the data in the column will be lost.
  - You are about to drop the column `line2` on the `addresses` table. All the data in the column will be lost.
  - Added the required column `addressLine` to the `addresses` table without a default value. This is not possible if the table is not empty.
  - Added the required column `firstName` to the `addresses` table without a default value. This is not possible if the table is not empty.
  - Added the required column `lastName` to the `addresses` table without a default value. This is not possible if the table is not empty.
  - Added the required column `title` to the `addresses` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `addresses` table without a default value. This is not possible if the table is not empty.
  - Made the column `district` on table `addresses` required. This step will fail if there are existing NULL values in that column.
  - Made the column `phone` on table `addresses` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "users" ADD COLUMN "surname" TEXT;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_addresses" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "district" TEXT NOT NULL,
    "neighborhood" TEXT,
    "addressLine" TEXT NOT NULL,
    "postalCode" TEXT,
    "country" TEXT NOT NULL DEFAULT 'Türkiye',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "addresses_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_addresses" ("city", "createdAt", "district", "id", "isDefault", "phone", "postalCode", "userId") SELECT "city", "createdAt", "district", "id", "isDefault", "phone", "postalCode", "userId" FROM "addresses";
DROP TABLE "addresses";
ALTER TABLE "new_addresses" RENAME TO "addresses";
CREATE INDEX "addresses_userId_idx" ON "addresses"("userId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "cart_items_productId_idx" ON "cart_items"("productId");
