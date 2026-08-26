import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/require-admin";
import { inventoryUpdateSchema } from "@/lib/validation";
import { writeAuditLog, getClientIp } from "@/lib/audit";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/admin/inventory/:productId  { quantity: <delta>, type, reason }
 * "quantity" burada MEVCUT stoğa eklenecek/çıkarılacak DELTA'dır (ör. -3 = 3 satıldı).
 * Bölüm 22 — negatif stok engeli: sonuç < 0 olacaksa 400 döner.
 */
export async function PATCH(req: NextRequest, { params }: { params: { productId: string } }) {
  const auth = await requireAdmin(["ADMIN", "SUPER_ADMIN", "STAFF"]);
  if (!auth.ok) return auth.response;

  const inventory = await prisma.inventory.findUnique({ where: { productId: params.productId } });
  if (!inventory) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const body = await req.json().catch(() => null);
  const parsed = inventoryUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "VALIDATION_ERROR", details: parsed.error.flatten() }, { status: 400 });
  }
  const { quantity: delta, type, reason } = parsed.data;
  const resulting = inventory.quantity + delta;

  if (resulting < 0) {
    return NextResponse.json(
      { error: "NEGATIVE_STOCK", message: `Bu işlem stoğu negatife düşürür (${inventory.quantity} + ${delta} = ${resulting})` },
      { status: 400 }
    );
  }

  const stockStatus = resulting === 0 ? "OUT_OF_STOCK" : resulting <= inventory.lowStockThreshold ? "LOW_STOCK" : "IN_STOCK";

  const [updatedInventory] = await prisma.$transaction([
    prisma.inventory.update({ where: { productId: params.productId }, data: { quantity: resulting, stockStatus } }),
    prisma.inventoryMovement.create({
      data: {
        inventoryId: inventory.id,
        type,
        quantityChange: delta,
        resultingQuantity: resulting,
        reason: reason ?? null,
        createdByAdminId: auth.session.user.id,
      },
    }),
  ]);

  await writeAuditLog({
    adminUserId: auth.session.user.id,
    action: "INVENTORY_UPDATE",
    entity: "Inventory",
    entityId: params.productId,
    ipAddress: getClientIp(req),
    metadata: { delta, resulting, type, reason: reason ?? null },
  });

  return NextResponse.json(updatedInventory);
}
