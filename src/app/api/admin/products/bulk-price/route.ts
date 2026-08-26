import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/require-admin";
import { bulkPriceUpdateSchema } from "@/lib/validation";
import { applyBulkAdjustment } from "@/lib/pricing";
import { writeAuditLog, getClientIp } from "@/lib/audit";

export const dynamic = "force-dynamic";

/**
 * Bölüm 16 — Toplu fiyat revizyonu için servis/API altyapısı.
 * UI bu fazda tam yapılmadı (bkz. docs/admin.md) ama servis çalışır ve
 * test edilmiştir: kategoriye/alt kategoriye veya seçili ürün id listesine
 * +% / -% / +TL / -TL uygulanabilir. dryRun:true ile önizleme yapılabilir
 * (hiçbir kayıt değişmez, yalnızca hesaplanan sonuç döner).
 */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin(["ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => null);
  const parsed = bulkPriceUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "VALIDATION_ERROR", details: parsed.error.flatten() }, { status: 400 });
  }
  const { categoryId, subcategoryId, productIds, adjustment, dryRun } = parsed.data;

  if (!categoryId && !subcategoryId && (!productIds || productIds.length === 0)) {
    return NextResponse.json(
      { error: "VALIDATION_ERROR", message: "categoryId, subcategoryId veya productIds alanlarından en az biri gerekli" },
      { status: 400 }
    );
  }

  const where: Record<string, unknown> = {};
  if (categoryId) where.categoryId = categoryId;
  if (subcategoryId) where.subcategoryId = subcategoryId;
  if (productIds && productIds.length > 0) where.id = { in: productIds };

  const products = await prisma.product.findMany({ where });

  const preview = products.map((p) => ({
    id: p.id,
    name: p.name,
    oldPrice: Number(p.price),
    newPrice: applyBulkAdjustment(Number(p.price), adjustment.type, adjustment.value),
  }));

  if (dryRun) {
    return NextResponse.json({ dryRun: true, affectedCount: preview.length, preview: preview.slice(0, 50) });
  }

  await prisma.$transaction(
    preview.flatMap((item) => [
      prisma.product.update({ where: { id: item.id }, data: { price: item.newPrice } }),
      prisma.priceHistory.create({
        data: {
          productId: item.id,
          field: "price",
          oldValue: item.oldPrice,
          newValue: item.newPrice,
          reason: `bulk:${adjustment.type}:${adjustment.value}`,
          changedById: auth.session.user.id,
        },
      }),
    ])
  );

  await writeAuditLog({
    adminUserId: auth.session.user.id,
    action: "BULK_PRICE_UPDATE",
    entity: "Product",
    entityId: null,
    ipAddress: getClientIp(req),
    metadata: { affectedCount: preview.length, adjustment, categoryId, subcategoryId, productIds },
  });

  return NextResponse.json({ dryRun: false, affectedCount: preview.length });
}
