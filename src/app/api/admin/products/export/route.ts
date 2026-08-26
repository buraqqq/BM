import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/require-admin";
import { toCsv } from "@/lib/csv";
import { writeAuditLog, getClientIp } from "@/lib/audit";
import { getCategorySubtreeIds } from "@/lib/category-tree";

export const dynamic = "force-dynamic";

const EXPORT_HEADERS = [
  "SKU",
  "Barkod",
  "Ürün Adı",
  "Kategori (tam ad)",
  "Marka (tam ad)",
  "Fiyat",
  "Eski Fiyat (Karşılaştırma)",
  "İndirimli Fiyat",
  "Maliyet Fiyatı",
  "KDV (%)",
  "Birim",
  "Stok",
  "Min. Stok",
  "Aktif mi",
  "Öne Çıkan mı",
  "Kısa Açıklama",
  "SEO Başlık",
  "SEO Açıklama",
];

/**
 * Bölüm 26 — CSV Dışa Aktarma.
 * GET /api/admin/products/export?search=&categoryId=&brandId=&active=&stock=
 * Filtre parametreleri admin ürün listesiyle (/api/admin/products) BİREBİR
 * aynı isimlerde — o ekrandaki filtre durumu doğrudan bu uca yansıtılabilir.
 * Başlıklar, /api/admin/import/preview'in beklediği sütun adlarıyla (bkz.
 * IMPORT_FIELD_LABELS) BİREBİR aynıdır — dışa aktarılan bir dosya, hiçbir
 * sütun eşleştirmesi gerekmeden doğrudan tekrar içe aktarılabilir.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(req.url);
  const search = searchParams.get("search")?.trim();
  const categoryId = searchParams.get("categoryId") ?? undefined;
  const brandId = searchParams.get("brandId") ?? undefined;
  const activeParam = searchParams.get("active");
  const stockParam = searchParams.get("stock");

  const where: Record<string, unknown> = {};
  if (categoryId) {
    const subtreeIds = await getCategorySubtreeIds(categoryId);
    where.categoryId = { in: subtreeIds };
  }
  if (brandId) where.brandId = brandId;
  if (activeParam === "true") where.isActive = true;
  if (activeParam === "false") where.isActive = false;
  if (search) {
    where.OR = [{ name: { contains: search } }, { sku: { contains: search } }, { barcode: { contains: search } }];
  }
  if (stockParam) {
    where.inventory = { stockStatus: stockParam === "in" ? "IN_STOCK" : stockParam === "low" ? "LOW_STOCK" : "OUT_OF_STOCK" };
  }

  // 50.000 ürün hedefinde bile tek seferde belleğe sığar (metin veri,
  // görsel/ikili içerik yok); yine de sınırsız büyümeyi önlemek için üst
  // sınır konuldu — aşılırsa filtre daraltılması istenir.
  const EXPORT_LIMIT = 50_000;
  const total = await prisma.product.count({ where });
  if (total > EXPORT_LIMIT) {
    return NextResponse.json(
      { error: "TOO_MANY_ROWS", message: `Filtreye uyan ${total} ürün var, tek dosyada dışa aktarma sınırı ${EXPORT_LIMIT}. Lütfen filtreleri daraltın.` },
      { status: 400 }
    );
  }

  const products = await prisma.product.findMany({
    where,
    include: { category: true, brand: true, inventory: true },
    orderBy: { name: "asc" },
  });

  const rows = products.map((p) => ({
    "SKU": p.sku,
    "Barkod": p.barcode ?? "",
    "Ürün Adı": p.name,
    "Kategori (tam ad)": p.category.title,
    "Marka (tam ad)": p.brand?.name ?? "",
    "Fiyat": Number(p.price),
    "Eski Fiyat (Karşılaştırma)": p.compareAtPrice !== null ? Number(p.compareAtPrice) : "",
    "İndirimli Fiyat": p.salePrice !== null ? Number(p.salePrice) : "",
    "Maliyet Fiyatı": p.costPrice !== null ? Number(p.costPrice) : "",
    "KDV (%)": Number(p.taxRate),
    "Birim": p.unit,
    "Stok": p.inventory?.quantity ?? 0,
    "Min. Stok": p.inventory?.lowStockThreshold ?? 5,
    "Aktif mi": p.isActive ? "evet" : "hayır",
    "Öne Çıkan mı": p.isFeatured ? "evet" : "hayır",
    "Kısa Açıklama": p.shortDescription ?? "",
    "SEO Başlık": p.seoTitle ?? "",
    "SEO Açıklama": p.seoDescription ?? "",
  }));

  const csv = toCsv(rows, EXPORT_HEADERS);

  await writeAuditLog({
    adminUserId: auth.session.user.id,
    action: "PRODUCT_EXPORT",
    entity: "Product",
    entityId: null,
    ipAddress: getClientIp(req),
    metadata: { count: products.length, filters: { search: search ?? null, categoryId: categoryId ?? null, brandId: brandId ?? null, active: activeParam, stock: stockParam } },
  });

  const fileName = `urunler-${new Date().toISOString().slice(0, 10)}.csv`;
  return new NextResponse("﻿" + csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${fileName}"`,
    },
  });
}
