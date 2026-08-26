import { prisma } from "@/lib/prisma";

export interface InventorySummary {
  lowStockCount: number;
  outOfStockCount: number;
  unverifiedInventoryCount: number;
}

/**
 * Bölüm 18/21/32/38/45 — düşük stok / tükenen / doğrulanmamış envanter
 * sayaçlarının TEK kaynağı. Hem /api/admin/inventory hem de admin
 * dashboard'u aynı fonksiyonu çağırır — iki ekranda birbirinden farklı
 * sayılar görünmesi mümkün değildir.
 *
 * "Doğrulanmamış" = aktif üründe, üzerinde MIGRATION dışında hiçbir gerçek
 * stok hareketi (RESTOCK/SALE/COUNT_ADJUSTMENT/...) YOK demektir — hâlâ
 * FAZ 1'in varsayımsal başlangıç değeridir (Bölüm 45'in açık uyarısı).
 */
export async function getInventorySummary(): Promise<InventorySummary> {
  const [lowStockCount, outOfStockCount, unverifiedInventoryCount] = await Promise.all([
    prisma.inventory.count({ where: { stockStatus: "LOW_STOCK", product: { isActive: true } } }),
    prisma.inventory.count({ where: { stockStatus: "OUT_OF_STOCK", product: { isActive: true } } }),
    prisma.inventory.count({
      where: { product: { isActive: true }, movements: { none: { type: { not: "MIGRATION" } } } },
    }),
  ]);
  return { lowStockCount, outOfStockCount, unverifiedInventoryCount };
}
