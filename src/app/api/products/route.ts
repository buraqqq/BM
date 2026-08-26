import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentlyActiveCampaigns } from "@/lib/pricing";
import { serializePublicProduct } from "@/lib/serialize";

export const dynamic = "force-dynamic";

/**
 * GET /api/products?category=<slug>&search=<q>&featured=1&page=1&pageSize=50
 * Public — yalnızca isActive=true ürünleri döner. Fiyat, aktif kampanyalar
 * dahil edilerek backend'de hesaplanır (Bölüm 11).
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const categorySlug = searchParams.get("category") ?? undefined;
  const search = searchParams.get("search")?.trim() ?? undefined;
  const featured = searchParams.get("featured");
  const page = Math.max(1, Number(searchParams.get("page") ?? 1));
  const pageSize = Math.min(100, Math.max(1, Number(searchParams.get("pageSize") ?? 50)));

  const where: Record<string, unknown> = { isActive: true };
  if (categorySlug) where.category = { slug: categorySlug };
  if (featured === "1") where.isFeatured = true;
  if (search) {
    where.OR = [
      { name: { contains: search } },
      { shortDescription: { contains: search } },
    ];
  }

  const [items, total, activeCampaigns] = await Promise.all([
    prisma.product.findMany({
      where,
      include: { category: true, images: true, inventory: true },
      orderBy: { name: "asc" },
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
  });
}
