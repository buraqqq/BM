import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/require-admin";
import { bulkPriceUpdateSchema } from "@/lib/validation";
import { applyBulkAdjustment } from "@/lib/pricing";
import { writeAuditLog, getClientIp } from "@/lib/audit";
import { getCategorySubtreeIds } from "@/lib/category-tree";

export const dynamic = "force-dynamic";

/**
 * Bölüm 13/14/15 — Toplu Fiyat Motoru.
 * Kapsam: tüm ürünler (allProducts:true, kazara tetiklenmeyi önlemek için
 * EXPLICIT olmalı) / kategori (+ tüm alt kategorileri) / marka / seçili
 * ürün id listesi (filtre sonucu ürünler de admin UI'da bu listeye
 * dönüştürülüp gönderilir).
 * İşlem: +% / -% / +TL / -TL / belirli fiyata getir (SET_PRICE).
 * ÖNİZLEME ZORUNLU: dryRun:true her zaman ÖNCE çağrılmalı — bu uç "hemen
 * uygula" davranışına sahip değildir, admin UI akışı her zaman
 * önizle → onayla → uygula sırasını izler (bkz. docs/pricing.md).
 * UYGULAMA TRANSACTION İÇİNDE: yarım kalan toplu güncelleme veritabanını
 * tutarsız bırakmaz (Bölüm 37).
 */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin(["ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => null);
  const parsed = bulkPriceUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "VALIDATION_ERROR", details: parsed.error.flatten() }, { status: 400 });
  }
  const { allProducts, categoryId, brandId, productIds, adjustment, dryRun } = parsed.data;

  if (!allProducts && !categoryId && !brandId && (!productIds || productIds.length === 0)) {
    return NextResponse.json(
      {
        error: "VALIDATION_ERROR",
        message: "allProducts, categoryId, brandId veya productIds alanlarından en az biri gerekli (kazara toplu işlemi önlemek için hiçbiri varsayılan olarak 'tümü' anlamına gelmez)",
      },
      { status: 400 }
    );
  }

  const where: Record<string, unknown> = {};
  if (categoryId) {
    const subtreeIds = await getCategorySubtreeIds(categoryId);
    where.categoryId = { in: subtreeIds };
  }
  if (brandId) where.brandId = brandId;
  if (productIds && productIds.length > 0) where.id = { in: productIds };

  const products = await prisma.product.findMany({ where, select: { id: true, name: true, price: true } });

  const preview = products.map((p) => ({
    id: p.id,
    name: p.name,
    oldPrice: Number(p.price),
    newPrice: applyBulkAdjustment(Number(p.price), adjustment.type, adjustment.value),
  }));

  if (dryRun) {
    return NextResponse.json({ dryRun: true, affectedCount: preview.length, preview: preview.slice(0, 200) });
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
    metadata: { affectedCount: preview.length, adjustment, allProducts, categoryId, brandId, productIds },
  });

  return NextResponse.json({ dryRun: false, affectedCount: preview.length });
}
