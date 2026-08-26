import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/require-admin";
import { bulkProductActionSchema } from "@/lib/validation";
import { writeAuditLog, getClientIp } from "@/lib/audit";

export const dynamic = "force-dynamic";

/**
 * Bölüm 22 — Ürün Toplu İşlemleri.
 * POST /api/admin/products/bulk-action
 * { productIds, action, categoryId?, brandId?, campaignId? }
 *
 * Desteklenen action'lar (bkz. BULK_PRODUCT_ACTIONS, src/lib/enums.ts):
 * ACTIVATE / DEACTIVATE / ARCHIVE / SET_CATEGORY / SET_BRAND / SET_FEATURED
 * / UNSET_FEATURED / ADD_TO_CAMPAIGN / REMOVE_FROM_CAMPAIGN.
 * ("fiyat değiştir" toplu işlemi kasıtlı olarak burada YOK — o zaten ayrı,
 * daha zengin bir önizleme akışına sahip /api/admin/products/bulk-price
 * ucunda; aynı işi iki farklı yerde iki farklı şekilde yapmamak için.)
 *
 * Not: mevcut şemada ARCHIVE ile DEACTIVATE aynı alanı (isActive=false)
 * değiştirir — Product modelinde ayrı bir "archived" durumu yok, yalnızca
 * isActive var. İkisi ayrı action değeri olarak tutuldu ki audit log'da
 * "kullanıcı hangi niyetle tıkladı" bilgisi kaybolmasın.
 *
 * Her işlem TEK bir transaction içinde uygulanır (Bölüm 37 — yarım kalan
 * toplu işlem veritabanını tutarsız bırakmaz) ve PRODUCT_BULK_ACTION olarak
 * audit log'a yazılır (Bölüm 33/45 — hangi ürünler, kim, ne zaman, hangi işlem).
 */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin(["ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => null);
  const parsed = bulkProductActionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "VALIDATION_ERROR", details: parsed.error.flatten() }, { status: 400 });
  }
  const { productIds, action, categoryId, brandId, campaignId } = parsed.data;

  if (action === "SET_CATEGORY" && !categoryId) {
    return NextResponse.json({ error: "VALIDATION_ERROR", message: "SET_CATEGORY için categoryId zorunlu" }, { status: 400 });
  }
  if (action === "SET_BRAND" && brandId === undefined) {
    return NextResponse.json({ error: "VALIDATION_ERROR", message: "SET_BRAND için brandId zorunlu (markayı kaldırmak için null gönderin)" }, { status: 400 });
  }
  if ((action === "ADD_TO_CAMPAIGN" || action === "REMOVE_FROM_CAMPAIGN") && !campaignId) {
    return NextResponse.json({ error: "VALIDATION_ERROR", message: `${action} için campaignId zorunlu` }, { status: 400 });
  }

  // Kapsam dışı/var olmayan id gönderilirse sessizce yutmak yerine gerçek
  // eşleşen ürün sayısını netleştirmek için önce mevcut ürünleri doğrula.
  const existing = await prisma.product.findMany({ where: { id: { in: productIds } }, select: { id: true } });
  const validIds = existing.map((p) => p.id);
  if (validIds.length === 0) {
    return NextResponse.json({ error: "NOT_FOUND", message: "Seçili ürünlerden hiçbiri bulunamadı" }, { status: 404 });
  }

  if (action === "SET_CATEGORY") {
    const category = await prisma.category.findUnique({ where: { id: categoryId } });
    if (!category) return NextResponse.json({ error: "VALIDATION_ERROR", message: "Geçersiz categoryId" }, { status: 400 });
  }
  if (action === "SET_BRAND" && brandId) {
    const brand = await prisma.brand.findUnique({ where: { id: brandId } });
    if (!brand) return NextResponse.json({ error: "VALIDATION_ERROR", message: "Geçersiz brandId" }, { status: 400 });
  }
  if ((action === "ADD_TO_CAMPAIGN" || action === "REMOVE_FROM_CAMPAIGN") && campaignId) {
    const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
    if (!campaign) return NextResponse.json({ error: "VALIDATION_ERROR", message: "Geçersiz campaignId" }, { status: 400 });
  }

  const where = { id: { in: validIds } };

  switch (action) {
    case "ACTIVATE":
      await prisma.product.updateMany({ where, data: { isActive: true } });
      break;
    case "DEACTIVATE":
    case "ARCHIVE":
      await prisma.product.updateMany({ where, data: { isActive: false } });
      break;
    case "SET_CATEGORY":
      await prisma.product.updateMany({ where, data: { categoryId: categoryId! } });
      break;
    case "SET_BRAND":
      await prisma.product.updateMany({ where, data: { brandId: brandId ?? null } });
      break;
    case "SET_FEATURED":
      await prisma.product.updateMany({ where, data: { isFeatured: true } });
      break;
    case "UNSET_FEATURED":
      await prisma.product.updateMany({ where, data: { isFeatured: false } });
      break;
    case "ADD_TO_CAMPAIGN":
      await prisma.$transaction(
        validIds.map((productId) =>
          prisma.campaignProduct.upsert({
            where: { campaignId_productId: { campaignId: campaignId!, productId } },
            create: { campaignId: campaignId!, productId },
            update: {},
          })
        )
      );
      break;
    case "REMOVE_FROM_CAMPAIGN":
      await prisma.campaignProduct.deleteMany({ where: { campaignId: campaignId!, productId: { in: validIds } } });
      break;
  }

  await writeAuditLog({
    adminUserId: auth.session.user.id,
    action: "PRODUCT_BULK_ACTION",
    entity: "Product",
    entityId: null,
    ipAddress: getClientIp(req),
    metadata: { action, affectedCount: validIds.length, productIds: validIds, categoryId, brandId, campaignId },
  });

  return NextResponse.json({ action, affectedCount: validIds.length });
}
