-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_product_alerts" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "alertType" TEXT NOT NULL,
    "targetPrice" DECIMAL,
    "isTriggered" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "product_alerts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "product_alerts_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_product_alerts" ("alertType", "createdAt", "id", "isTriggered", "productId", "targetPrice", "updatedAt", "userId") SELECT "alertType", "createdAt", "id", "isTriggered", "productId", "targetPrice", "updatedAt", "userId" FROM "product_alerts";
DROP TABLE "product_alerts";
ALTER TABLE "new_product_alerts" RENAME TO "product_alerts";
CREATE INDEX "product_alerts_userId_idx" ON "product_alerts"("userId");
CREATE INDEX "product_alerts_productId_alertType_isTriggered_idx" ON "product_alerts"("productId", "alertType", "isTriggered");
CREATE INDEX "product_alerts_status_idx" ON "product_alerts"("status");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
