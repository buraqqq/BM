import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentlyActiveCampaigns } from "@/lib/pricing";
import { serializePublicProduct } from "@/lib/serialize";
import { buildProductSearchWhere, buildProductOrderBy, parseSortKey } from "@/lib/search";

export const dynamic = "force-dynamic";

/**
 * GET /api/products?category=<slug>&subtree=1&search=<q>&brand=<slug>
 *                    &minPrice=&maxPrice=&inStock=1&featured=1&sort=<key>
 *                    &page=1&pageSize=50
 * Public — yalnızca isActive=true ürünleri döner. Fiyat, aktif kampanyalar
 * dahil edilerek backend'de hesaplanır (Bölüm 11).
 *
 * FAZ 3 — Bölüm 2/3/5: filtre/sıralama/kategori-alt-ağacı mantığı
 * src/lib/search.ts'e taşındı (tek yerden yönetilen, test edilebilir sorgu
 * inşası — bkz. o dosyanın başındaki mimari notu). `subtree=1` verilmezse
 * davranış FAZ 2'deki gibi kalır (yalnızca doğrudan bu kategoriye ait
 * ürünler) — bu, mevcut çağrıları kırmamak için varsayılan kapalı.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const categorySlug = searchParams.get("category") ?? undefined;
  const subtree = searchParams.get("subtree") === "1";
  const search = searchParams.get("search")?.trim() || undefined;
  const brandSlug = searchParams.get("brand") ?? undefined;
  const minPriceParam = searchParams.get("minPrice");
  const maxPriceParam = searchParams.get("maxPrice");
  const inStockOnly = searchParams.get("inStock") === "1";
  const featuredOnly = searchParams.get("featured") === "1";
  const sort = parseSortKey(searchParams.get("sort"));
  const page = Math.max(1, Number(searchParams.get("page") ?? 1));
  const pageSize = Math.min(100, Math.max(1, Number(searchParams.get("pageSize") ?? 50)));

  const where = await buildProductSearchWhere({
    query: search,
    categorySlug,
    subtree,
    brandSlug,
    minPrice: minPriceParam ? Number(minPriceParam) : undefined,
    maxPrice: maxPriceParam ? Number(maxPriceParam) : undefined,
    inStockOnly,
    featuredOnly,
  });
  const orderBy = buildProductOrderBy(sort, !!search);

  const [items, total, activeCampaigns] = await Promise.all([
    prisma.product.findMany({
      where,
      include: { category: true, brand: true, images: true, inventory: true },
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.product.count({ where }),
    getCurrentlyActiveCampaigns(),
  ]);

  return NextResponse.json({
    items: items.map((p) => serializePublicProduct(p, activeCampaigns)),
    page,
    pageSize,
    total,
    totalPages: Math.ceil(total / pageSize),
    sort,
  });
}
