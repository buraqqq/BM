import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/require-admin";
import { getInventorySummary } from "@/lib/inventory-summary";

export const dynamic = "force-dynamic";

/**
 * Bölüm 18/21/32 — Stok listesi + dashboard özeti.
 * "verified": bu ürünün stoğu üzerinde MIGRATION dışında en az bir gerçek
 * hareket (RESTOCK/SALE/COUNT_ADJUSTMENT/...) yapılmış mı? Yapılmadıysa
 * hâlâ FAZ 1 migrasyonundaki varsayımsal başlangıç değeridir — admin
 * panelinde "doğrulanmayı bekliyor" olarak açıkça işaretlenir (Bölüm 45:
 * "kullanıcı fiziksel sayım yapmadan stokları otomatik doğru ilan etme").
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(req.url);
  const search = searchParams.get("search")?.trim();
  const filter = searchParams.get("filter"); // "low" | "out" | "unverified" | null

  const where: Record<string, unknown> = { isActive: true };
  if (search) {
    where.OR = [{ name: { contains: search } }, { sku: { contains: search } }, { barcode: { contains: search } }];
  }
  if (filter === "low") where.inventory = { stockStatus: "LOW_STOCK" };
  if (filter === "out") where.inventory = { stockStatus: "OUT_OF_STOCK" };

  const products = await prisma.product.findMany({
    where,
    include: { category: true, inventory: true },
    orderBy: { updatedAt: "desc" },
    take: 500,
  });

  // "verified" hesaplamasını satır satır (take:20 gibi kısıtlı bir alt
  // sorguya güvenmeden) tek bir sorguyla, MIGRATION dışı hareketi OLAN tüm
  // inventoryId'lerin tam kümesini alarak yapıyoruz — bu sayede 20'den fazla
  // hareketi olan bir üründe gerçek hareket "gözden kaçmaz".
  const verifiedInventoryIds = new Set(
    (
      await prisma.inventoryMovement.findMany({
        where: { type: { not: "MIGRATION" } },
        select: { inventoryId: true },
        distinct: ["inventoryId"],
      })
    ).map((m) => m.inventoryId)
  );

  const items = products.map((p) => {
    const verified = p.inventory ? verifiedInventoryIds.has(p.inventory.id) : false;
    return {
      id: p.id,
      name: p.name,
      sku: p.sku,
      category: { title: p.category.title },
      stock: p.inventory?.quantity ?? 0,
      minimumStock: p.inventory?.lowStockThreshold ?? 5,
      stockStatus: p.inventory?.stockStatus ?? "IN_STOCK",
      verified,
    };
  });

  const filtered = filter === "unverified" ? items.filter((i) => !i.verified) : items;

  const summary = await getInventorySummary();

  return NextResponse.json({ items: filtered, summary });
}
