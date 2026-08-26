import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/require-admin";
import { inventoryCountSchema } from "@/lib/validation";
import { writeAuditLog, getClientIp } from "@/lib/audit";
import { deriveStockStatus } from "@/lib/stock-status";

export const dynamic = "force-dynamic";

/**
 * Bölüm 20 — Stok Sayım Modu.
 * PATCH /api/admin/inventory/:productId/count  { countedQuantity, reason }
 * "countedQuantity" (delta değil) fiziksel sayımın MUTLAK sonucudur.
 * Sistem stoğu ile fark hesaplanır, InventoryMovement türü COUNT_ADJUSTMENT
 * olarak, hem "önceki" hem "sonraki" miktarla birlikte kaydedilir, ayrıca
 * audit log'a da INVENTORY_COUNT olarak yazılır (Bölüm 33).
 */
export async function PATCH(req: NextRequest, { params }: { params: { productId: string } }) {
  const auth = await requireAdmin(["ADMIN", "SUPER_ADMIN", "STAFF"]);
  if (!auth.ok) return auth.response;

  const inventory = await prisma.inventory.findUnique({ where: { productId: params.productId } });
  if (!inventory) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const body = await req.json().catch(() => null);
  const parsed = inventoryCountSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "VALIDATION_ERROR", details: parsed.error.flatten() }, { status: 400 });
  }
  const { countedQuantity, reason } = parsed.data;
  const previousQuantity = inventory.quantity;
  const diff = countedQuantity - previousQuantity;

  const stockStatus = deriveStockStatus(countedQuantity, inventory.lowStockThreshold);

  const [updatedInventory] = await prisma.$transaction([
    prisma.inventory.update({ where: { productId: params.productId }, data: { quantity: countedQuantity, stockStatus } }),
    prisma.inventoryMovement.create({
      data: {
        inventoryId: inventory.id,
        type: "COUNT_ADJUSTMENT",
        quantityChange: diff,
        resultingQuantity: countedQuantity,
        reason: reason ?? `Fiziksel sayım: sistem ${previousQuantity} -> sayılan ${countedQuantity}`,
        createdByAdminId: auth.session.user.id,
      },
    }),
  ]);

  await writeAuditLog({
    adminUserId: auth.session.user.id,
    action: "INVENTORY_COUNT",
    entity: "Inventory",
    entityId: params.productId,
    ipAddress: getClientIp(req),
    metadata: { previousQuantity, countedQuantity, diff, reason: reason ?? null },
  });

  return NextResponse.json({ ...updatedInventory, previousQuantity, diff });
}
